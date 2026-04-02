/**
 * @aesthetic-function/server - auditLog.ts
 *
 * Async, non-blocking audit trail for Watcher → Plugin broadcasts.
 *
 * ARCHITECTURE:
 * - Uses an in-memory queue to buffer log entries
 * - Writes to sync-log.md at repo root asynchronously
 * - Never blocks the WebSocket broadcast path
 * - Controlled by ENABLE_AUDIT_LOG environment variable
 *
 * LOG FORMAT (per entry):
 * ```markdown
 * ## [ISO_TIMESTAMP] [requestId] type=<messageType> source=<source>
 * file=<filePath>
 * ops=<N>
 * - node="<nodeQuery>" action=<op> value="<value>"
 * ```
 */

import { appendFile, access, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// =============================================================================
// OPERATION TYPE (matches watcher's FigmaOperation)
// =============================================================================

/**
 * Operation format from the watcher.
 * This is the actual shape received, not the shared protocol type.
 */
export interface WatcherOperation {
  op: string;
  nodeId?: string | null;
  nodeQuery?: string;
  color?: string;
  text?: string;
  value?: string;
  layoutConfig?: {
    layoutMode?: string;
    itemSpacing?: number;
  };
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Path to the sync log file at repo root.
 * packages/server/src -> packages/server -> packages -> repo root
 */
const SYNC_LOG_PATH = join(__dirname, '..', '..', '..', 'sync-log.md');

/**
 * Maximum queue size before dropping old entries (memory protection).
 */
const MAX_QUEUE_SIZE = 1000;

/**
 * Flush interval in milliseconds.
 */
const FLUSH_INTERVAL_MS = 100;

// =============================================================================
// STATE
// =============================================================================

/** In-memory queue of log entries waiting to be written */
const logQueue: string[] = [];

/** Whether we're currently flushing the queue */
let isFlushing = false;

/** Flush timer reference */
let flushTimer: NodeJS.Timeout | null = null;

/** Whether the log file has been initialized with a header */
let isInitialized = false;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if audit logging is enabled via environment variable.
 */
export function isAuditLogEnabled(): boolean {
  const flag = process.env.ENABLE_AUDIT_LOG?.toLowerCase();
  return flag === 'true' || flag === '1';
}

/**
 * Metadata for an audit log entry.
 */
export interface AuditLogEntry {
  /** Unique request identifier */
  requestId: string;
  /** Message type (e.g., APPLY_OPERATIONS) */
  messageType: string;
  /** Source of the operations (marker, llm, openai, anthropic, stub) */
  source?: string;
  /** Relative file path or "unknown" */
  filePath?: string;
  /** Array of Figma operations */
  operations: WatcherOperation[];
  /** ISO timestamp */
  timestamp: string;
  /** Number of clients notified */
  clientsNotified?: number;
  /** Active policy profile name (Phase 15D) */
  profile?: string;
  /** Config source path (Phase 15D) */
  configSource?: string;
  /** Policy settings snapshot (Phase 15D) */
  policySettings?: Record<string, unknown>;
}

/**
 * Log a broadcast event to the audit trail.
 *
 * This function is async but designed to be fire-and-forget.
 * It queues the entry and returns immediately without blocking.
 *
 * @param entry - The audit log entry metadata
 */
export function logBroadcast(entry: AuditLogEntry): void {
  if (!isAuditLogEnabled()) {
    return;
  }

  const logEntry = formatLogEntry(entry);
  queueLogEntry(logEntry);
}

/**
 * Metadata for a Design → Code change event.
 */
export interface DesignChangeLogEntry {
  /** Unique request identifier */
  requestId: string;
  /** Node name in Figma */
  nodeName: string;
  /** Node ID in Figma */
  nodeId: string;
  /** Changes captured */
  changes: Array<{ changeType: string; value: string }>;
  /** ISO timestamp */
  timestamp: string;
  /** Number of watchers notified */
  watchersNotified: number;
}

/**
 * Log a Design → Code change event to the audit trail.
 *
 * @param entry - The design change entry metadata
 */
export function logDesignChange(entry: DesignChangeLogEntry): void {
  if (!isAuditLogEnabled()) {
    return;
  }

  const logEntry = formatDesignChangeEntry(entry);
  queueLogEntry(logEntry);
}

/**
 * Metadata for a component map update event.
 */
export interface MapUpdateLogEntry {
  /** Base component name */
  baseName: string;
  /** Variant state (null for base) */
  variantState: string | null;
  /** Figma node ID for the variant */
  variantNodeId: string;
  /** Figma Component Set node ID (optional) */
  componentSetNodeId?: string;
  /** ISO timestamp */
  timestamp: string;
  /** Path to component-map.json */
  mapPath: string;
}

/**
 * Log a component map update event to the audit trail.
 *
 * @param entry - The map update entry metadata
 */
export function logMapUpdate(entry: MapUpdateLogEntry): void {
  if (!isAuditLogEnabled()) {
    return;
  }

  const logEntry = formatMapUpdateEntry(entry);
  queueLogEntry(logEntry);
}

/**
 * Metadata for a compose operations event (Phase 11B).
 */
export interface ComposeLogEntry {
  /** Unique request identifier */
  requestId: string;
  /** Execution mode */
  mode: 'dry-run' | 'apply';
  /** Number of operations */
  operationCount: number;
  /** Operation types summary */
  operationTypes: Record<string, number>;
  /** ISO timestamp */
  timestamp: string;
  /** Whether operations were sent to plugin */
  sentToPlugin: boolean;
  /** Plugin client count */
  pluginClientCount: number;
}

/**
 * Log a compose operations event to the audit trail.
 *
 * @param entry - The compose entry metadata
 */
export function logCompose(entry: ComposeLogEntry): void {
  if (!isAuditLogEnabled()) {
    return;
  }

  const logEntry = formatComposeEntry(entry);
  queueLogEntry(logEntry);
}

/**
 * Metadata for an apply properties event (Phase 11C).
 */
export interface ApplyPropertiesLogEntry {
  /** Unique request identifier */
  requestId: string;
  /** Execution mode */
  mode: 'dry-run' | 'apply';
  /** Number of operations */
  operationCount: number;
  /** Property types summary */
  propertyTypes: Record<string, number>;
  /** ISO timestamp */
  timestamp: string;
  /** Whether operations were sent to plugin */
  sentToPlugin: boolean;
  /** Plugin client count */
  pluginClientCount: number;
}

/**
 * Log an apply properties event to the audit trail.
 *
 * @param entry - The apply properties entry metadata
 */
export function logApplyProperties(entry: ApplyPropertiesLogEntry): void {
  if (!isAuditLogEnabled()) {
    return;
  }

  const logEntry = formatApplyPropertiesEntry(entry);
  queueLogEntry(logEntry);
}

/**
 * Format an apply properties entry as markdown.
 */
function formatApplyPropertiesEntry(entry: ApplyPropertiesLogEntry): string {
  const lines: string[] = [
    `## [${entry.timestamp}] [${entry.requestId}] type=APPLY_PROPERTIES mode=${entry.mode}`,
    `operations=${entry.operationCount} plugins=${entry.pluginClientCount} sent=${entry.sentToPlugin}`,
  ];

  // Property type breakdown
  for (const [propType, count] of Object.entries(entry.propertyTypes)) {
    lines.push(`- ${propType}: ${count}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format a compose entry as markdown.
 */
function formatComposeEntry(entry: ComposeLogEntry): string {
  const lines: string[] = [
    `## [${entry.timestamp}] [${entry.requestId}] type=COMPOSE_OPERATIONS mode=${entry.mode}`,
    `operations=${entry.operationCount} plugins=${entry.pluginClientCount} sent=${entry.sentToPlugin}`,
  ];

  // Operation type breakdown
  for (const [opType, count] of Object.entries(entry.operationTypes)) {
    lines.push(`- ${opType}: ${count}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format a map update entry as markdown.
 */
function formatMapUpdateEntry(entry: MapUpdateLogEntry): string {
  const variantKey = entry.variantState ?? 'base';
  const componentKey = `${entry.baseName}::${variantKey}`;
  
  const lines: string[] = [
    `## [${entry.timestamp}] MAP_UPDATE`,
    `component=${componentKey}`,
    `nodeId=${entry.variantNodeId}`,
  ];
  
  if (entry.componentSetNodeId) {
    lines.push(`componentSetNodeId=${entry.componentSetNodeId}`);
  }
  
  lines.push('');
  return lines.join('\n');
}

/**
 * Flush any pending log entries immediately.
 * Useful for graceful shutdown.
 */
export async function flushAuditLog(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushQueue();
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format a log entry as markdown.
 */
function formatLogEntry(entry: AuditLogEntry): string {
  const source = entry.source ?? 'unknown';
  const filePath = entry.filePath ?? 'unknown';
  const opCount = entry.operations.length;

  // Header line
  const lines: string[] = [
    `## [${entry.timestamp}] [${entry.requestId}] type=${entry.messageType} source=${source}`,
    `file=${filePath}`,
    `ops=${opCount}`,
  ];

  // Profile / config metadata (Phase 15D — optional, additive)
  if (entry.profile) {
    lines.push(`profile=${entry.profile}`);
  }
  if (entry.configSource) {
    lines.push(`configSource=${entry.configSource}`);
  }
  if (entry.policySettings && Object.keys(entry.policySettings).length > 0) {
    lines.push(`policy=${JSON.stringify(entry.policySettings)}`);
  }

  // Operation details (summarized, not full JSON)
  for (const op of entry.operations) {
    const nodeQuery = op.nodeQuery ?? 'unknown';
    const action = op.op;
    const value = summarizeValue(op);
    lines.push(`- node="${nodeQuery}" action=${action} value="${value}"`);
  }

  // Add trailing newline for separation
  lines.push('');

  return lines.join('\n');
}

/**
 * Format a Design → Code change entry as markdown.
 */
function formatDesignChangeEntry(entry: DesignChangeLogEntry): string {
  const lines: string[] = [
    `## [${entry.timestamp}] [${entry.requestId}] type=DESIGN_CHANGE source=figma-plugin`,
    `node="${entry.nodeName}" (${entry.nodeId})`,
    `changes=${entry.changes.length} watchers=${entry.watchersNotified}`,
  ];

  for (const change of entry.changes) {
    lines.push(`- ${change.changeType}="${change.value}"`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Summarize an operation's value for logging.
 * Truncates long values to prevent log bloat.
 */
function summarizeValue(op: WatcherOperation): string {
  // Get the value based on operation type
  let value: string;

  switch (op.op) {
    case 'SET_TEXT':
      value = op.text ?? op.value ?? '';
      break;
    case 'SET_FILL':
      value = op.color ?? op.value ?? '';
      break;
    case 'SET_LAYOUT':
      // Summarize layout as direction + spacing
      value = op.layoutConfig
        ? `${op.layoutConfig.layoutMode ?? 'auto'},gap=${op.layoutConfig.itemSpacing ?? 0}`
        : 'layout';
      break;
    default:
      value = op.value ?? op.color ?? op.text ?? 'unknown';
  }

  // Truncate long values
  const maxLen = 50;
  if (value.length > maxLen) {
    return value.slice(0, maxLen - 3) + '...';
  }

  return value;
}

// =============================================================================
// QUEUE MANAGEMENT
// =============================================================================

/**
 * Add an entry to the log queue.
 */
function queueLogEntry(entry: string): void {
  // Drop oldest entries if queue is full (memory protection)
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    logQueue.shift();
  }

  logQueue.push(entry);

  // Schedule a flush if not already scheduled
  scheduleFlush();
}

/**
 * Schedule an async flush.
 */
function scheduleFlush(): void {
  if (flushTimer) {
    return; // Already scheduled
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue().catch((err) => {
      console.error('[AuditLog] Flush error:', err);
    });
  }, FLUSH_INTERVAL_MS);
}

/**
 * Flush the queue to disk.
 */
async function flushQueue(): Promise<void> {
  if (isFlushing || logQueue.length === 0) {
    return;
  }

  isFlushing = true;

  try {
    // Initialize the log file if needed
    if (!isInitialized) {
      await initializeLogFile();
      isInitialized = true;
    }

    // Drain the queue
    const entries = logQueue.splice(0, logQueue.length);
    const content = entries.join('\n');

    // Append to file
    await appendFile(SYNC_LOG_PATH, content, 'utf-8');
  } catch (err) {
    console.error('[AuditLog] Write error:', err);
    // Don't re-queue failed entries to prevent infinite loops
  } finally {
    isFlushing = false;
  }
}

/**
 * Initialize the log file with a header if it doesn't exist.
 */
async function initializeLogFile(): Promise<void> {
  try {
    await access(SYNC_LOG_PATH);
    // File exists, no need to initialize
  } catch {
    // File doesn't exist, create with header
    const header = `# Sync Log

Audit trail of Watcher → Plugin broadcasts.

---

`;
    await writeFile(SYNC_LOG_PATH, header, 'utf-8');
    console.log(`[AuditLog] Created ${SYNC_LOG_PATH}`);
  }
}

// =============================================================================
// SHUTDOWN HANDLER
// =============================================================================

/**
 * Ensure logs are flushed on process exit.
 */
process.on('beforeExit', async () => {
  await flushAuditLog();
});
