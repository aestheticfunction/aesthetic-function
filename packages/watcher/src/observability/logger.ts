/**
 * @aesthetic-function/watcher - observability/logger.ts
 *
 * Structured logging for TraceSummary.
 *
 * WHY: Phase 9C adds production-grade observability. This logger provides:
 * - Human-readable summary (always printed)
 * - JSON lines for machine parsing (when TRACE_JSON=true)
 * - Verbose details (when TRACE_VERBOSE=true)
 */

import type { TraceSummary } from './types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Check if tracing is enabled.
 * Default: true
 */
export function isTraceEnabled(): boolean {
  const flag = process.env.TRACE?.toLowerCase();
  if (flag === 'false' || flag === '0') {
    return false;
  }
  return true; // Default: enabled
}

/**
 * Check if JSON trace output is enabled.
 * Default: false
 */
export function isTraceJsonEnabled(): boolean {
  const flag = process.env.TRACE_JSON?.toLowerCase();
  return flag === 'true' || flag === '1';
}

/**
 * Check if verbose trace output is enabled.
 * Default: false
 */
export function isTraceVerboseEnabled(): boolean {
  const flag = process.env.TRACE_VERBOSE?.toLowerCase();
  return flag === 'true' || flag === '1';
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Format source counts as a compact string.
 * e.g., "override=2 marker=2 ast=0 code=1"
 */
function formatSourceCounts(counts: Record<string, number>): string {
  const parts: string[] = [];
  const order = ['override', 'marker', 'ast', 'code'];

  for (const source of order) {
    if (source in counts) {
      parts.push(`${source}=${counts[source]}`);
    }
  }

  // Add any other sources not in the standard order
  for (const [source, count] of Object.entries(counts)) {
    if (!order.includes(source)) {
      parts.push(`${source}=${count}`);
    }
  }

  return parts.join(' ') || 'none';
}

/**
 * Format timings as a compact string.
 * e.g., "read=5ms parse=12ms transform=3ms total=45ms"
 */
function formatTimings(timings: TraceSummary['timingsMs']): string {
  const parts: string[] = [];
  const order: (keyof TraceSummary['timingsMs'])[] = [
    'readFile',
    'parse',
    'reconcile',
    'transform',
    'mapResolve',
    'send',
    'total',
  ];

  for (const key of order) {
    const value = timings[key];
    if (value !== undefined) {
      const shortKey = key === 'readFile' ? 'read' : key === 'mapResolve' ? 'map' : key;
      parts.push(`${shortKey}=${value}ms`);
    }
  }

  return parts.join(' ') || 'none';
}

/**
 * Truncate a request ID for display.
 */
function truncateRequestId(requestId: string): string {
  if (requestId.length <= 24) {
    return requestId;
  }
  return requestId.slice(0, 20) + '...';
}

// =============================================================================
// MAIN LOGGING FUNCTION
// =============================================================================

/**
 * Log a TraceSummary.
 *
 * Always prints a concise human summary (1-3 lines).
 * Optionally emits a JSON line when TRACE_JSON=true.
 * Adds verbose details when TRACE_VERBOSE=true.
 */
export function logTrace(trace: TraceSummary): void {
  if (!isTraceEnabled()) {
    return;
  }

  const prefix = '[Trace]';

  // Line 1: Basic info
  const line1Parts = [
    `requestId=${truncateRequestId(trace.requestId)}`,
  ];

  if (trace.filePath) {
    line1Parts.push(`file=${trace.filePath}`);
  }

  line1Parts.push(`parse=${trace.parseMode}`);
  line1Parts.push(`intents=${trace.intentsCount}`);
  line1Parts.push(`ops=${trace.opsCount}`);

  console.log(`${prefix} ${line1Parts.join(' ')}`);

  // Line 2: Resolution
  const line2Parts = [
    formatSourceCounts(trace.resolution.countsBySource),
  ];

  if (trace.resolution.usedComponentMap) {
    line2Parts.push(`map: used=true mappedOps=${trace.resolution.mappedOps}`);
  } else {
    line2Parts.push(`map: used=false`);
  }

  console.log(`${prefix} resolution: ${line2Parts.join(' ')}`);

  // Line 3: Emit
  const line3Parts = [
    `enabled=${trace.emit.enabled}`,
    `sent=${trace.emit.sent}`,
  ];

  if (trace.emit.clientsNotified !== undefined) {
    line3Parts.push(`clients=${trace.emit.clientsNotified}`);
  }

  if (trace.emit.suppressedWatcherEmit) {
    line3Parts.push(`suppressedWatcher=true`);
  }

  console.log(`${prefix} emit: ${line3Parts.join(' ')}`);

  // Warning if no ops
  if (trace.opsCount === 0) {
    if (trace.intentsCount === 0) {
      console.warn(`${prefix} ⚠ No intents found (check @figma markers or LLM mode)`);
    } else {
      console.warn(`${prefix} ⚠ Intents found but no ops generated (check transform)`);
    }
  }

  // Errors
  if (trace.errors && trace.errors.length > 0) {
    for (const error of trace.errors) {
      console.error(`${prefix} ✗ [${error.stage}] ${error.message}`);
    }
  }

  // Verbose output
  if (isTraceVerboseEnabled()) {
    console.log(`${prefix} [verbose] source=${trace.source}`);
    if (trace.componentKey) {
      console.log(`${prefix} [verbose] componentKey=${trace.componentKey}`);
    }
    if (trace.state) {
      console.log(`${prefix} [verbose] state=${trace.state}`);
    }
    console.log(`${prefix} [verbose] timings: ${formatTimings(trace.timingsMs)}`);
    console.log(`${prefix} [verbose] resolution.policy=${trace.resolution.policy}`);
    console.log(`${prefix} [verbose] resolution.appliedOverrides=${trace.resolution.appliedOverrides}`);
    console.log(`${prefix} [verbose] resolution.staleOverrides=${trace.resolution.staleOverrides}`);
    console.log(`${prefix} [verbose] resolution.ignoredOverrides=${trace.resolution.ignoredOverrides}`);
  }

  // JSON output
  if (isTraceJsonEnabled()) {
    console.log(JSON.stringify({ _type: 'trace', ...trace }));
  }
}

// =============================================================================
// SPECIALIZED LOGGING
// =============================================================================

/**
 * Log node resolution path (for TRACE_VERBOSE).
 *
 * Shows how a node query was resolved to a target.
 */
export function logNodeResolution(
  nodeQuery: string,
  resolution: {
    type: 'name' | 'id' | 'variant';
    state?: string;
    componentMapKey?: string;
    resolvedId?: string;
  }
): void {
  if (!isTraceVerboseEnabled()) {
    return;
  }

  const prefix = '[Trace] [resolve]';
  const parts = [`"${nodeQuery}"`];

  if (resolution.type === 'id') {
    parts.push(`→ id:${resolution.resolvedId}`);
    if (resolution.componentMapKey) {
      parts.push(`(via map key="${resolution.componentMapKey}")`);
    }
  } else if (resolution.type === 'variant') {
    parts.push(`→ variant`);
    if (resolution.state) {
      parts.push(`state=${resolution.state}`);
    }
  } else {
    parts.push(`→ name query`);
  }

  console.log(`${prefix} ${parts.join(' ')}`);
}

/**
 * Log a suppression decision.
 */
export function logSuppression(
  filePath: string,
  decision: {
    suppressed: boolean;
    reason: 'same-ops' | 'different-ops' | 'ttl-expired' | 'no-record';
    opsHash?: string;
    cachedHash?: string;
  }
): void {
  if (!isTraceEnabled()) {
    return;
  }

  const prefix = '[Trace] [suppression]';

  if (decision.suppressed) {
    console.log(
      `${prefix} ${filePath}: SUPPRESSED (${decision.reason})`
    );
  } else if (isTraceVerboseEnabled()) {
    console.log(
      `${prefix} ${filePath}: not suppressed (${decision.reason})`
    );
  }
}
