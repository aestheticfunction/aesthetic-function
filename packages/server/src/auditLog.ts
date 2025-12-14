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
