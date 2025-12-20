/**
 * @aesthetic-function/watcher - observability/index.ts
 *
 * Public API for observability module.
 */

export {
  type TraceSummary,
  type SuppressionEntry,
  createTraceSummary,
  addTraceError,
  hashOperations,
} from './types.js';

export {
  logTrace,
  logNodeResolution,
  logSuppression,
  isTraceEnabled,
  isTraceJsonEnabled,
  isTraceVerboseEnabled,
} from './logger.js';
