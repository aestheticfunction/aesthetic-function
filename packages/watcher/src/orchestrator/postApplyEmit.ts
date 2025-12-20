/**
 * @aesthetic-function/watcher - orchestrator/postApplyEmit.ts
 *
 * Post-Apply Emit: Immediately push changes to Figma after orchestrator apply.
 *
 * WHY: Phase 9B enables immediate Figma refresh after Feature Orchestrator
 * applies changes. This module:
 * 1. Reads the updated file from disk
 * 2. Parses intent model (marker or LLM mode)
 * 3. Applies reconciliation and overrides
 * 4. Transforms to FigmaOperations
 * 5. Applies component map resolution
 * 6. Sends to server for immediate Figma update
 *
 * This is the same pipeline as the watcher, but triggered immediately after
 * apply (instead of waiting for file-change events).
 *
 * OBSERVABILITY (Phase 9C):
 * - TraceSummary is generated for each emit operation
 * - Structured logging via logTrace() provides visibility
 * - Enhanced suppression uses ops-hash for smarter duplicate detection
 */

import { readFile, stat } from 'node:fs/promises';
import {
  parseIntentFromReact,
  hasFigmaMarkers,
} from '../parse/parseIntentFromReact.js';
import {
  intentToFigmaOps,
  createIntentModel,
  type FigmaOperation,
} from '../transform/intentToFigmaOps.js';
import { getDefaultTokenContext } from '../tokens/designTokens.js';
import {
  analyzeCodeWithLLM,
  isLLMAnalyzerEnabled,
  isLLMAnalyzerAvailable,
} from '../analyze/analyzeCodeWithLLM.js';
import {
  loadDesignOverrides,
  applyOverridesToIntentModel,
  getUseOverrides,
  getOverridesPrecedence,
} from '../reconcile/index.js';
import {
  loadComponentMap,
  resolveFromMap,
  createIdQuery,
  componentMapExists,
} from '../reconcile/componentMap.js';
import type { ComponentState } from './types.js';
import {
  type SuppressionEntry,
  createTraceSummary,
  addTraceError,
  hashOperations,
  logTrace,
  logSuppression,
} from '../observability/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for post-apply emit.
 */
export interface PostApplyEmitOptions {
  /** Absolute path to the file to emit for */
  absolutePath: string;
  /** Relative path to the file */
  relativePath: string;
  /** Target component key (optional; used for logging) */
  componentKey?: string;
  /** Target state (optional; for logging and state-aware ops) */
  state?: ComponentState;
  /** Server URL to send operations to */
  serverUrl?: string;
}

/**
 * Result of post-apply emit.
 */
export interface PostApplyEmitResult {
  /** Number of Figma operations generated */
  opsCount: number;
  /** Number of intents parsed */
  intentsCount: number;
  /** Number of overrides applied */
  appliedOverridesCount: number;
  /** Whether the operations were sent to server */
  sent: boolean;
  /** Number of connected Figma clients notified (from server response) */
  serverClientsNotified?: number;
  /** Request ID used for the emit */
  requestId: string;
  /** Error message if send failed */
  error?: string;
}

/**
 * Server send result shape.
 */
interface SendResult {
  success: boolean;
  clientsNotified: number;
  requestId: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Check if post-apply emit is enabled.
 * Default: false (opt-in feature).
 */
export function isPostApplyEmitEnabled(): boolean {
  const flag = process.env.POST_APPLY_EMIT?.toLowerCase();
  return flag === 'true' || flag === '1';
}

/**
 * Get the debounce delay for post-apply emit.
 * Default: 200ms
 */
export function getPostApplyEmitDebounceMs(): number {
  const ms = process.env.POST_APPLY_EMIT_DEBOUNCE_MS;
  if (ms) {
    const parsed = parseInt(ms, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 200;
}

/**
 * Get server URL from environment or use default.
 */
function getServerUrl(): string {
  return process.env.SERVER_URL ?? 'http://localhost:3001';
}

/**
 * Check if LLM_ANALYZE_ALL flag is enabled.
 */
function isLLMAnalyzeAllEnabled(): boolean {
  const flag = process.env.LLM_ANALYZE_ALL?.toLowerCase();
  return flag === 'true' || flag === '1';
}

/**
 * Check if component map resolution is enabled.
 */
let componentMapEnabled: boolean | null = null;

async function isComponentMapEnabled(): Promise<boolean> {
  const flag = process.env.USE_COMPONENT_MAP?.toLowerCase();
  if (flag === 'false' || flag === '0') {
    return false;
  }
  if (flag === 'true' || flag === '1') {
    return true;
  }
  // Default: enabled if file exists
  if (componentMapEnabled === null) {
    componentMapEnabled = await componentMapExists();
  }
  return componentMapEnabled;
}

// =============================================================================
// EMIT SUPPRESSION (Avoid Double Updates)
// =============================================================================

/**
 * In-memory cache to track recent feature-emit operations.
 * Enhanced in Phase 9C with ops-hash for smarter duplicate detection.
 *
 * When the orchestrator emits, we record:
 * - File path
 * - Timestamp
 * - Hash of operations (to detect if content actually changed)
 *
 * The watcher checks this cache to suppress duplicate sends.
 */
const emitSuppression = new Map<string, SuppressionEntry>();

/** TTL for suppression entries (1 second) */
const SUPPRESSION_TTL_MS = 1000;

/**
 * Record that a feature-emit was done for a file.
 * Called after successfully sending operations.
 *
 * @param filePath - Relative file path
 * @param opsHash - Hash of the operations that were sent
 * @param requestIdPrefix - Prefix of the request ID (e.g. "feature-emit")
 */
export function recordFeatureEmit(
  filePath: string,
  opsHash?: string,
  requestIdPrefix: string = 'feature-emit'
): void {
  const entry: SuppressionEntry = {
    timestamp: Date.now(),
    opsHash: opsHash ?? '',
    requestIdPrefix,
  };
  emitSuppression.set(filePath, entry);
}

/**
 * Check if a file was recently emitted by the feature orchestrator.
 * The watcher should call this to avoid duplicate sends.
 *
 * Enhanced in Phase 9C: Also checks ops-hash to allow different content
 * to pass through even if within TTL window.
 *
 * @param filePath - Relative or absolute file path
 * @param opsHash - Optional hash of operations the watcher wants to send
 * @returns True if the file was recently emitted and should be suppressed
 */
export function shouldSuppressWatcherEmit(
  filePath: string,
  opsHash?: string
): boolean {
  const entry = emitSuppression.get(filePath);
  if (!entry) {
    return false;
  }
  const elapsed = Date.now() - entry.timestamp;
  if (elapsed >= SUPPRESSION_TTL_MS) {
    // TTL expired, remove entry
    emitSuppression.delete(filePath);
    logSuppression(filePath, {
      suppressed: false,
      reason: 'ttl-expired',
      opsHash,
      cachedHash: entry.opsHash,
    });
    return false;
  }

  // Within TTL window - check if ops are actually different
  if (opsHash && entry.opsHash && opsHash !== entry.opsHash) {
    // Content is different, allow through
    logSuppression(filePath, {
      suppressed: false,
      reason: 'different-ops',
      opsHash,
      cachedHash: entry.opsHash,
    });
    return false;
  }

  // Same content or no hash comparison - suppress
  logSuppression(filePath, {
    suppressed: true,
    reason: 'same-ops',
    opsHash,
    cachedHash: entry.opsHash,
  });
  return true;
}

/**
 * Clear the suppression cache (for testing).
 */
export function clearEmitSuppression(): void {
  emitSuppression.clear();
}

/**
 * Prune expired entries from the suppression cache.
 */
export function pruneEmitSuppression(): void {
  const now = Date.now();
  for (const [key, entry] of emitSuppression) {
    if (now - entry.timestamp >= SUPPRESSION_TTL_MS) {
      emitSuppression.delete(key);
    }
  }
}

/**
 * Get the current suppression entry for a file (for testing/diagnostics).
 */
export function getSuppressionEntry(filePath: string): SuppressionEntry | undefined {
  return emitSuppression.get(filePath);
}

// =============================================================================
// SERVER COMMUNICATION
// =============================================================================

/**
 * Send Figma operations to the server.
 */
async function sendOperationsToServer(
  operations: FigmaOperation[],
  requestId: string,
  serverUrl: string,
  source: string,
  filePath: string
): Promise<SendResult> {
  const response = await fetch(`${serverUrl}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operations,
      requestId,
      source,
      filePath,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<SendResult>;
}

// =============================================================================
// COMPONENT MAP RESOLUTION
// =============================================================================

/**
 * Parse a nodeQuery to extract base name and state.
 */
function parseNodeQuery(nodeQuery: string): { baseName: string; state: string | null } {
  const parts = nodeQuery.split('::');
  return {
    baseName: parts[0],
    state: parts.length > 1 ? parts[1] : null,
  };
}

/**
 * Apply component map resolution to operations.
 */
async function applyComponentMapResolution(
  operations: FigmaOperation[]
): Promise<FigmaOperation[]> {
  const enabled = await isComponentMapEnabled();
  if (!enabled) {
    return operations;
  }

  const map = await loadComponentMap();
  if (!map) {
    return operations;
  }

  return operations.map((op) => {
    if (!op.nodeQuery) {
      return op;
    }

    const { baseName, state } = parseNodeQuery(op.nodeQuery);
    const resolution = resolveFromMap(map, baseName, state);

    if (resolution.found && resolution.nodeId) {
      console.log(
        `[PostApplyEmit] Map resolution: "${op.nodeQuery}" → id:${resolution.nodeId}`
      );
      return {
        ...op,
        nodeQuery: createIdQuery(resolution.nodeId),
      };
    }

    return op;
  });
}

// =============================================================================
// MAIN EMIT FUNCTION
// =============================================================================

/**
 * Perform post-apply emit for a file.
 *
 * This runs the same pipeline as the watcher:
 * 1. Parse intent model (marker or LLM mode)
 * 2. Apply reconciliation and overrides
 * 3. Transform to FigmaOperations
 * 4. Apply component map resolution
 * 5. Send to server
 *
 * @param options - Post-apply emit options
 * @returns Result with ops count and send status
 */
export async function postApplyEmit(
  options: PostApplyEmitOptions
): Promise<PostApplyEmitResult> {
  const {
    absolutePath,
    relativePath,
    componentKey,
    state,
    serverUrl = getServerUrl(),
  } = options;

  const requestId = `feature-emit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  console.log(`[PostApplyEmit] Starting emit for ${relativePath}`);
  if (componentKey) {
    console.log(`[PostApplyEmit] Component: ${componentKey}, State: ${state ?? 'base'}`);
  }

  try {
    // Read file content fresh from disk
    const [content, fileStat] = await Promise.all([
      readFile(absolutePath, 'utf-8'),
      stat(absolutePath),
    ]);
    const fileMtime = fileStat.mtime;

    // Determine parsing mode
    const useLLM = isLLMAnalyzerEnabled() && isLLMAnalyzerAvailable();
    const hasMarkers = hasFigmaMarkers(content);

    if (!hasMarkers && !useLLM) {
      console.log(`[PostApplyEmit] No @figma markers and LLM disabled, skipping emit`);
      return {
        opsCount: 0,
        intentsCount: 0,
        appliedOverridesCount: 0,
        sent: false,
        requestId,
      };
    }

    // Parse intent model
    let model;
    let source: string;

    if (useLLM && (hasMarkers || isLLMAnalyzeAllEnabled())) {
      console.log(`[PostApplyEmit] Using LLM analyzer...`);
      const tokenContext = getDefaultTokenContext();
      const analyzeResult = await analyzeCodeWithLLM(content, tokenContext, {
        filePath: relativePath,
      });
      model = analyzeResult.model;
      source = 'feature-emit-llm';
      console.log(`[PostApplyEmit] LLM found ${model.intents.length} intent(s)`);
    } else {
      console.log(`[PostApplyEmit] Using marker parser...`);
      const parseResult = parseIntentFromReact(content, relativePath);
      model = createIntentModel(parseResult.intents, relativePath);
      source = 'feature-emit-marker';
      console.log(`[PostApplyEmit] Marker parser found ${model.intents.length} intent(s)`);
    }

    if (model.intents.length === 0) {
      console.log(`[PostApplyEmit] No intents extracted, skipping emit`);
      return {
        opsCount: 0,
        intentsCount: 0,
        appliedOverridesCount: 0,
        sent: false,
        requestId,
      };
    }

    // Load overrides and apply reconciliation
    const overrides = await loadDesignOverrides();
    let appliedOverridesCount = 0;

    const useOverrides = getUseOverrides();
    const precedence = getOverridesPrecedence();

    if (useOverrides && overrides && Object.keys(overrides).length > 0) {
      const { model: reconciledModel, result: reconcileResult } = applyOverridesToIntentModel(
        model,
        overrides,
        { fileMtime, precedence }
      );
      model = reconciledModel;
      appliedOverridesCount = reconcileResult.matched;
      console.log(`[PostApplyEmit] Applied ${appliedOverridesCount} override(s)`);
    }

    // Transform intents to Figma operations
    const tokenContext = getDefaultTokenContext();
    const transformResult = intentToFigmaOps(model, tokenContext);

    console.log(`[PostApplyEmit] Generated ${transformResult.operations.length} operation(s)`);

    if (transformResult.operations.length === 0) {
      console.log(`[PostApplyEmit] No operations to emit, skipping`);
      return {
        opsCount: 0,
        intentsCount: model.intents.length,
        appliedOverridesCount,
        sent: false,
        requestId,
      };
    }

    // Apply component map resolution
    const resolvedOps = await applyComponentMapResolution(transformResult.operations);

    // Generate ops hash for smarter suppression
    const opsHash = hashOperations(resolvedOps as unknown as Record<string, unknown>[]);

    // Send to server
    console.log(`[PostApplyEmit] Sending to ${serverUrl}...`);

    const sendResult = await sendOperationsToServer(
      resolvedOps,
      requestId,
      serverUrl,
      source,
      relativePath
    );

    // Record for suppression with ops hash (watcher should ignore this file briefly)
    recordFeatureEmit(relativePath, opsHash, 'feature-emit');

    // Generate TraceSummary for observability
    const parseMode = useLLM ? 'llm' : 'markers';
    const trace = createTraceSummary(requestId, source);
    trace.filePath = relativePath;
    trace.parseMode = parseMode;
    trace.componentKey = componentKey;
    trace.state = state;
    trace.intentsCount = model.intents.length;
    trace.opsCount = resolvedOps.length;
    trace.resolution.appliedOverrides = appliedOverridesCount;
    trace.resolution.policy = precedence;
    trace.emit.enabled = true;
    trace.emit.sent = true;
    trace.emit.clientsNotified = sendResult.clientsNotified;
    trace.emit.suppressedWatcherEmit = true;

    // Log trace summary
    logTrace(trace);

    console.log(`[PostApplyEmit] ✓ Sent ${resolvedOps.length} ops (${sendResult.clientsNotified} client(s))`);

    return {
      opsCount: resolvedOps.length,
      intentsCount: model.intents.length,
      appliedOverridesCount,
      sent: true,
      serverClientsNotified: sendResult.clientsNotified,
      requestId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[PostApplyEmit] ✗ Failed: ${errorMsg}`);

    // Create error trace
    const trace = createTraceSummary(requestId, 'feature-emit');
    trace.filePath = relativePath;
    trace.componentKey = componentKey;
    trace.state = state;
    trace.emit.enabled = true;
    trace.emit.sent = false;
    addTraceError(trace, 'emit', errorMsg);
    logTrace(trace);

    return {
      opsCount: 0,
      intentsCount: 0,
      appliedOverridesCount: 0,
      sent: false,
      requestId,
      error: errorMsg,
    };
  }
}

// =============================================================================
// DEBOUNCED EMIT
// =============================================================================

/**
 * Pending debounce timers by file path.
 */
const pendingEmits = new Map<string, NodeJS.Timeout>();

/**
 * Debounced post-apply emit.
 *
 * If multiple writes occur in quick succession (within debounce window),
 * only the last one will trigger the emit.
 *
 * @param options - Post-apply emit options
 * @returns Promise that resolves with the emit result
 */
export function postApplyEmitDebounced(
  options: PostApplyEmitOptions
): Promise<PostApplyEmitResult> {
  const debounceMs = getPostApplyEmitDebounceMs();

  return new Promise((resolve) => {
    // Clear any existing pending emit for this file
    const existing = pendingEmits.get(options.relativePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule new emit
    const timer = setTimeout(async () => {
      pendingEmits.delete(options.relativePath);
      const result = await postApplyEmit(options);
      resolve(result);
    }, debounceMs);

    pendingEmits.set(options.relativePath, timer);
  });
}

/**
 * Cancel all pending debounced emits.
 */
export function cancelPendingEmits(): void {
  for (const timer of pendingEmits.values()) {
    clearTimeout(timer);
  }
  pendingEmits.clear();
}
