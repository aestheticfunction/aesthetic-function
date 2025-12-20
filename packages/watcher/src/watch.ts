/**
 * @aesthetic-function/watcher - watch.ts
 *
 * Chokidar-based file watcher that monitors React source files for changes.
 *
 * PIPELINE (Marker-based - default):
 *   File change → Parse @figma markers → IntentModel → FigmaOps → Server → Plugin
 *
 * PIPELINE (LLM-based - USE_LLM_ANALYZER=true):
 *   File change → LLM analysis → IntentModel → FigmaOps → Server → Plugin
 *
 * FEATURES:
 * - Configurable watch path via WATCH_PATH env var
 * - Feature flag USE_LLM_ANALYZER to toggle LLM mode
 * - Debounced events to avoid double triggers on save
 * - Only processes files with @figma markers (marker mode)
 * - Ignores node_modules and other non-source directories
 */

import { watch, type FSWatcher } from 'chokidar';
import { readFile, writeFile, access, stat } from 'node:fs/promises';
import { resolve, relative, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import {
  parseIntentFromReact,
  hasFigmaMarkers,
} from './parse/parseIntentFromReact.js';
import {
  intentToFigmaOps,
  createIntentModel,
} from './transform/intentToFigmaOps.js';
import { getDefaultTokenContext } from './tokens/designTokens.js';
import {
  analyzeCodeWithLLM,
  isLLMAnalyzerEnabled,
  isLLMAnalyzerAvailable,
} from './analyze/analyzeCodeWithLLM.js';
import {
  loadDesignOverrides,
  applyOverridesToIntentModel,
  getUseOverrides,
  getOverridesPrecedence,
} from './reconcile/index.js';
import {
  materialize,
  logMaterializeResult,
  isMaterializeEnabled,
  getMaterializeOn,
} from './materialize/index.js';
import {
  shouldSuppressWatcherEmit,
} from './orchestrator/postApplyEmit.js';
import {
  loadComponentMap,
  resolveFromMap,
  createIdQuery,
  componentMapExists,
} from './reconcile/componentMap.js';
import type { FigmaOperation } from './transform/intentToFigmaOps.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Check if LLM_ANALYZE_ALL flag is enabled.
 * When false (default), LLM mode only processes files with @figma markers.
 */
function isLLMAnalyzeAllEnabled(): boolean {
  const flag = process.env.LLM_ANALYZE_ALL?.toLowerCase();
  return flag === 'true' || flag === '1';
}

/**
 * Check if component map resolution is enabled.
 * Default: true if component-map.json exists.
 * Can be disabled with USE_COMPONENT_MAP=false.
 */
let componentMapEnabled: boolean | null = null;

async function isComponentMapEnabled(): Promise<boolean> {
  // Explicit flag takes precedence
  const flag = process.env.USE_COMPONENT_MAP?.toLowerCase();
  if (flag === 'false' || flag === '0') {
    return false;
  }
  if (flag === 'true' || flag === '1') {
    return true;
  }

  // Default: enabled if file exists (cache the result)
  if (componentMapEnabled === null) {
    componentMapEnabled = await componentMapExists();
  }
  return componentMapEnabled;
}

const DEFAULT_WATCH_PATH = './demo-app/src';
const DEBOUNCE_MS = 300;

/**
 * Get the watch path from environment or use default.
 */
export function getWatchPath(): string {
  return process.env.WATCH_PATH ?? DEFAULT_WATCH_PATH;
}

/**
 * Get the server URL from environment or use default.
 */
export function getServerUrl(): string {
  return process.env.SERVER_URL ?? 'http://localhost:3001';
}

// =============================================================================
// DEBOUNCE UTILITY
// =============================================================================

/**
 * Simple debounce implementation for file events.
 * Prevents multiple rapid saves from triggering multiple updates.
 */
function createDebouncer(delayMs: number): (key: string, fn: () => void) => void {
  const timers = new Map<string, NodeJS.Timeout>();

  return (key: string, fn: () => void) => {
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      timers.delete(key);
      fn();
    }, delayMs);

    timers.set(key, timer);
  };
}

// =============================================================================
// SERVER COMMUNICATION
// =============================================================================

interface SendResult {
  success: boolean;
  clientsNotified: number;
  requestId: string;
}

interface SendOptions {
  requestId: string;
  serverUrl: string;
  source?: string;
  filePath?: string;
}

/**
 * Send Figma operations to the server.
 */
async function sendOperationsToServer(
  operations: unknown[],
  options: SendOptions
): Promise<SendResult> {
  const response = await fetch(`${options.serverUrl}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operations,
      requestId: options.requestId,
      source: options.source,
      filePath: options.filePath,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<SendResult>;
}

// =============================================================================
// COMPONENT MAP RESOLUTION (Phase 8C)
// =============================================================================

/**
 * Parse a nodeQuery to extract base name and state.
 * Handles "NodeName" and "NodeName::state" formats.
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
 *
 * For each operation with a nodeQuery, check if the component map has a
 * mapped nodeId for that component/variant. If so, replace the nodeQuery
 * with "id:<nodeId>" format for stable targeting.
 *
 * @param operations - Array of Figma operations
 * @returns Modified operations with id: queries where applicable
 */
async function applyComponentMapResolution(
  operations: FigmaOperation[]
): Promise<FigmaOperation[]> {
  // Check if component map is enabled
  const enabled = await isComponentMapEnabled();
  if (!enabled) {
    return operations;
  }

  // Load the component map
  const map = await loadComponentMap();
  if (!map) {
    return operations;
  }

  // Apply resolution to each operation
  return operations.map((op) => {
    if (!op.nodeQuery) {
      return op;
    }

    // Parse the nodeQuery
    const { baseName, state } = parseNodeQuery(op.nodeQuery);

    // Check if we have a mapping
    const resolution = resolveFromMap(map, baseName, state);

    if (resolution.found && resolution.nodeId) {
      // Replace nodeQuery with id: format
      console.log(
        `[Watcher] Map resolution: "${op.nodeQuery}" → id:${resolution.nodeId}`
      );
      return {
        ...op,
        nodeQuery: createIdQuery(resolution.nodeId),
      };
    }

    // No mapping found - use original nodeQuery with warning if map exists
    if (map.components[baseName]) {
      // We have the component but not this variant
      console.warn(
        `[Watcher] ⚠ Component map has "${baseName}" but missing variant "${state ?? 'base'}"`
      );
    }

    return op;
  });
}

// =============================================================================
// FILE PROCESSING
// =============================================================================

/**
 * Process a changed file using marker-based parsing.
 * This is the default mode when USE_LLM_ANALYZER is not set.
 */
async function processFileWithMarkers(
  content: string,
  absolutePath: string,
  relativePath: string,
  serverUrl: string,
  repoRoot: string,
  fileMtime?: Date
): Promise<void> {
  // Quick check for markers
  if (!hasFigmaMarkers(content)) {
    console.log(`[Watcher] No @figma markers found, skipping`);
    return;
  }

  // Parse markers to intents
  const parseResult = parseIntentFromReact(content, relativePath);

  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach((w) => console.warn(`[Watcher] ⚠ ${w}`));
  }

  if (parseResult.intents.length === 0) {
    console.log(`[Watcher] No valid intents extracted`);
    return;
  }

  console.log(`[Watcher] Found ${parseResult.intents.length} intent(s) from markers`);

  // Create initial IntentModel
  const tokenContext = getDefaultTokenContext();
  let model = createIntentModel(parseResult.intents, relativePath);

  // Load overrides for both reconciliation and materialization
  const overrides = await loadDesignOverrides();

  // PHASE 5A.1/5A.2: Apply design overrides (soft reconciliation with precedence)
  const useOverrides = getUseOverrides();
  const precedence = getOverridesPrecedence();

  if (!useOverrides) {
    console.log(`[Watcher] Overrides: USE_OVERRIDES=false (skipping)`);
  } else {
    if (overrides && Object.keys(overrides).length > 0) {
      const { model: reconciledModel, result: reconcileResult } = applyOverridesToIntentModel(
        model,
        overrides,
        { fileMtime, precedence }
      );
      model = reconciledModel;

      // Log reconciliation summary
      if (precedence === 'if_newer_than_code') {
        const staleInfo = reconcileResult.stale > 0 ? ` (${reconcileResult.staleKeys.join(', ')} stale vs code)` : '';
        console.log(`[Watcher] Overrides: precedence=if_newer_than_code applied=${reconcileResult.matched} ignored=${reconcileResult.ignored} stale=${reconcileResult.stale}${staleInfo}`);
      } else {
        const matchedInfo = reconcileResult.overriddenNodes.length > 0
          ? ` (${reconcileResult.overriddenNodes.join(', ')})`
          : '';
        console.log(`[Watcher] Overrides: precedence=always applied=${reconcileResult.matched}${matchedInfo} ignored=${reconcileResult.ignored}`);
      }
    }
  }

  // PHASE 5B: Materialize design overrides to code (if enabled and triggered on file_save)
  const materializeOn = getMaterializeOn();
  if (isMaterializeEnabled() && materializeOn === 'file_save' && overrides && Object.keys(overrides).length > 0) {
    const materializeResult = await materialize({
      absolutePath,
      relativePath,
      content,
      intents: parseResult.intents,
      overrides,
      repoRoot,
    });

    if (materializeResult && materializeResult.changes > 0) {
      logMaterializeResult(materializeResult, '[Watcher]');
    }
  }

  // Transform intents to Figma operations
  const transformResult = intentToFigmaOps(model, tokenContext);

  console.log(`[Watcher] Generated ${transformResult.operations.length} operation(s)`);

  if (transformResult.resolvedTokens.length > 0) {
    transformResult.resolvedTokens.forEach((t) => {
      if (t.tokenName) {
        console.log(`[Watcher]   Token: ${t.input} → ${t.resolved}`);
      }
    });
  }

  // Phase 8C: Apply component map resolution for stable IDs
  const resolvedOps = await applyComponentMapResolution(transformResult.operations);

  // Send to server
  const requestId = `watch-marker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const result = await sendOperationsToServer(
    resolvedOps,
    {
      requestId,
      serverUrl,
      source: 'marker',
      filePath: relativePath,
    }
  );

  console.log(
    `[Watcher] ✓ Sent to server (${result.clientsNotified} client(s) notified)`
  );
}

/**
 * Process a changed file using LLM-based analysis.
 * This mode is enabled when USE_LLM_ANALYZER=true.
 */
async function processFileWithLLM(
  content: string,
  absolutePath: string,
  relativePath: string,
  serverUrl: string,
  repoRoot: string,
  fileMtime?: Date
): Promise<void> {
  console.log(`[Watcher] Using LLM analyzer...`);

  const tokenContext = getDefaultTokenContext();

  // Call LLM analyzer
  const analyzeResult = await analyzeCodeWithLLM(content, tokenContext, {
    filePath: relativePath,
    includeAnalysisSummary: true,
  });

  console.log(`[Watcher] LLM source: ${analyzeResult.source}`);

  if (analyzeResult.analysisSummary) {
    console.log(`[Watcher] Summary: ${analyzeResult.analysisSummary}`);
  }

  if (analyzeResult.usage) {
    console.log(
      `[Watcher] Tokens: ${analyzeResult.usage.promptTokens} prompt, ` +
      `${analyzeResult.usage.completionTokens} completion`
    );
  }

  if (analyzeResult.retryCount && analyzeResult.retryCount > 0) {
    console.log(`[Watcher] Retries: ${analyzeResult.retryCount}`);
  }

  if (analyzeResult.model.intents.length === 0) {
    console.log(`[Watcher] No intents extracted by LLM`);
    return;
  }

  console.log(`[Watcher] Found ${analyzeResult.model.intents.length} intent(s) from LLM`);

  // Load overrides for both reconciliation and materialization
  const overrides = await loadDesignOverrides();

  // PHASE 5A.1/5A.2: Apply design overrides (soft reconciliation with precedence)
  let model = analyzeResult.model;
  const useOverrides = getUseOverrides();
  const precedence = getOverridesPrecedence();

  if (!useOverrides) {
    console.log(`[Watcher] Overrides: USE_OVERRIDES=false (skipping)`);
  } else {
    if (overrides && Object.keys(overrides).length > 0) {
      const { model: reconciledModel, result: reconcileResult } = applyOverridesToIntentModel(
        model,
        overrides,
        { fileMtime, precedence }
      );
      model = reconciledModel;

      // Log reconciliation summary
      if (precedence === 'if_newer_than_code') {
        const staleInfo = reconcileResult.stale > 0 ? ` (${reconcileResult.staleKeys.join(', ')} stale vs code)` : '';
        console.log(`[Watcher] Overrides: precedence=if_newer_than_code applied=${reconcileResult.matched} ignored=${reconcileResult.ignored} stale=${reconcileResult.stale}${staleInfo}`);
      } else {
        const matchedInfo = reconcileResult.overriddenNodes.length > 0
          ? ` (${reconcileResult.overriddenNodes.join(', ')})`
          : '';
        console.log(`[Watcher] Overrides: precedence=always applied=${reconcileResult.matched}${matchedInfo} ignored=${reconcileResult.ignored}`);
      }
    }
  }

  // PHASE 5B: Materialize design overrides to code (if enabled and triggered on file_save)
  // Note: LLM mode extracts intents differently, but we still materialize based on those intents
  const materializeOn = getMaterializeOn();
  if (isMaterializeEnabled() && materializeOn === 'file_save' && overrides && Object.keys(overrides).length > 0) {
    const materializeResult = await materialize({
      absolutePath,
      relativePath,
      content,
      intents: analyzeResult.model.intents, // Use original intents, not reconciled
      overrides,
      repoRoot,
    });

    if (materializeResult && materializeResult.changes > 0) {
      logMaterializeResult(materializeResult, '[Watcher]');
    }
  }

  // Transform intents to Figma operations (same as marker mode)
  const transformResult = intentToFigmaOps(model, tokenContext);

  console.log(`[Watcher] Generated ${transformResult.operations.length} operation(s)`);

  if (transformResult.resolvedTokens.length > 0) {
    transformResult.resolvedTokens.forEach((t) => {
      if (t.tokenName) {
        console.log(`[Watcher]   Token: ${t.input} → ${t.resolved}`);
      }
    });
  }

  // Phase 8C: Apply component map resolution for stable IDs
  const resolvedOps = await applyComponentMapResolution(transformResult.operations);

  // Send to server
  const requestId = `watch-llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Determine the LLM source for audit trail
  const llmSource = analyzeResult.source === 'llm'
    ? (process.env.LLM_PROVIDER?.toLowerCase() === 'anthropic' ? 'anthropic' : 'openai')
    : analyzeResult.source;

  const result = await sendOperationsToServer(
    resolvedOps,
    {
      requestId,
      serverUrl,
      source: llmSource,
      filePath: relativePath,
    }
  );

  console.log(
    `[Watcher] ✓ Sent to server (${result.clientsNotified} client(s) notified)`
  );
}

/**
 * Process a changed file through the full pipeline.
 * Routes to marker-based or LLM-based processing based on feature flag.
 */
async function processFile(filePath: string, serverUrl: string): Promise<void> {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  const repoRoot = process.cwd();

  // Phase 9B: Check if this file was recently emitted by the Feature Orchestrator.
  // If so, suppress to avoid duplicate sends.
  if (shouldSuppressWatcherEmit(relativePath)) {
    console.log(`[Watcher] Suppressed: ${relativePath} (recently emitted by Feature Orchestrator)`);
    return;
  }

  console.log(`[Watcher] Processing: ${relativePath}`);

  try {
    // Read file content and get mtime for precedence checks
    const [content, fileStat] = await Promise.all([
      readFile(absolutePath, 'utf-8'),
      stat(absolutePath),
    ]);
    const fileMtime = fileStat.mtime;

    // Check feature flag
    if (isLLMAnalyzerEnabled()) {
      if (!isLLMAnalyzerAvailable()) {
        console.warn(`[Watcher] USE_LLM_ANALYZER=true but no API key configured`);
        console.warn(`[Watcher] Falling back to marker-based parsing`);
        await processFileWithMarkers(content, absolutePath, relativePath, serverUrl, repoRoot, fileMtime);
      } else {
        // Guard: skip LLM if no markers and LLM_ANALYZE_ALL is not enabled
        const hasMarkers = hasFigmaMarkers(content);
        if (!hasMarkers && !isLLMAnalyzeAllEnabled()) {
          console.log(`[Watcher] LLM mode: no @figma markers and LLM_ANALYZE_ALL!=true, skipping`);
          return;
        }

        // Try LLM, fall back to markers on any error
        try {
          await processFileWithLLM(content, absolutePath, relativePath, serverUrl, repoRoot, fileMtime);
        } catch (llmError) {
          const errorMsg = llmError instanceof Error ? llmError.message : String(llmError);
          console.warn(`[Watcher] LLM failed, falling back to marker-based parsing: ${errorMsg}`);
          if (hasMarkers) {
            await processFileWithMarkers(content, absolutePath, relativePath, serverUrl, repoRoot, fileMtime);
          } else {
            console.log(`[Watcher] No @figma markers to fall back to, skipping`);
          }
        }
      }
    } else {
      await processFileWithMarkers(content, absolutePath, relativePath, serverUrl, repoRoot, fileMtime);
    }
  } catch (error) {
    console.error(`[Watcher] ✗ Error processing file:`, error);
  }
}

// =============================================================================
// WATCHER
// =============================================================================

/**
 * Watcher options configuration.
 */
export interface WatcherOptions {
  /** Paths to watch (files or directories) */
  watchPaths?: string[];
  /** Server URL to send operations to */
  serverUrl?: string;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
}

/**
 * Start watching for file changes.
 */
export function startWatcher(
  watchPathsArg?: string[],
  serverUrlArg?: string
): FSWatcher {
  const watchPaths = watchPathsArg ?? [getWatchPath()];
  const serverUrl = serverUrlArg ?? getServerUrl();
  const debounce = createDebouncer(DEBOUNCE_MS);

  console.log(`[Watcher] Starting file watcher...`);
  console.log(`[Watcher] Watch paths: ${watchPaths.map((p) => resolve(p)).join(', ')}`);
  console.log(`[Watcher] Server URL: ${serverUrl}`);
  console.log(`[Watcher] Debounce: ${DEBOUNCE_MS}ms`);
  console.log('');

  const watcher = watch(watchPaths, {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/*.d.ts',
      '**/*.map',
    ],
    persistent: true,
    ignoreInitial: true, // Don't process existing files on startup
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('change', (path) => {
    // Only process TypeScript/JavaScript/JSX/TSX files
    if (!/\.(tsx?|jsx?)$/.test(path)) {
      return;
    }

    debounce(path, () => {
      processFile(path, serverUrl);
    });
  });

  watcher.on('add', (path) => {
    // Also process newly added files
    if (!/\.(tsx?|jsx?)$/.test(path)) {
      return;
    }

    debounce(path, () => {
      console.log(`[Watcher] New file detected: ${path}`);
      processFile(path, serverUrl);
    });
  });

  watcher.on('ready', () => {
    console.log('[Watcher] Ready and watching for changes...');
    console.log('[Watcher] Edit a file with @figma markers to trigger sync');
    console.log('');
  });

  watcher.on('error', (error) => {
    console.error('[Watcher] Error:', error);
  });

  return watcher;
}

/**
 * Stop the watcher.
 */
export async function stopWatcher(watcher: FSWatcher): Promise<void> {
  await watcher.close();
  console.log('[Watcher] Stopped');
}

// =============================================================================
// DESIGN → CODE LISTENER
// =============================================================================

/**
 * Path to the design overrides file at repo root.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DESIGN_OVERRIDES_PATH = join(__dirname, '..', '..', '..', 'design-overrides.json');

/**
 * Design override entry format.
 */
interface DesignOverride {
  text?: string;
  fill?: string;
  lastUpdated: string;
  nodeId: string;
}

/**
 * Read existing design overrides or return empty object.
 */
async function readDesignOverrides(): Promise<Record<string, DesignOverride>> {
  try {
    await access(DESIGN_OVERRIDES_PATH);
    const content = await readFile(DESIGN_OVERRIDES_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write design overrides to file.
 */
async function writeDesignOverrides(overrides: Record<string, DesignOverride>): Promise<void> {
  const content = JSON.stringify(overrides, null, 2);
  await writeFile(DESIGN_OVERRIDES_PATH, content, 'utf-8');
}

/**
 * Handle a DESIGN_CHANGE message from the server.
 */
async function handleDesignChange(payload: {
  nodeId: string;
  nodeName: string;
  changes: Array<{ changeType: 'text' | 'fill'; value: string }>;
}): Promise<void> {
  console.log(`[Watcher] DESIGN_CHANGE: "${payload.nodeName}" (${payload.changes.length} changes)`);

  // Read existing overrides
  const overrides = await readDesignOverrides();

  // Create or update the entry for this node
  const entry: DesignOverride = overrides[payload.nodeName] || {
    nodeId: payload.nodeId,
    lastUpdated: new Date().toISOString(),
  };

  // Apply changes
  for (const change of payload.changes) {
    if (change.changeType === 'text') {
      entry.text = change.value;
      console.log(`[Watcher]   text = "${change.value}"`);
    } else if (change.changeType === 'fill') {
      entry.fill = change.value;
      console.log(`[Watcher]   fill = "${change.value}"`);
    }
  }

  entry.nodeId = payload.nodeId;
  entry.lastUpdated = new Date().toISOString();
  overrides[payload.nodeName] = entry;

  // Write back
  await writeDesignOverrides(overrides);
  console.log(`[Watcher] ✓ Updated design-overrides.json`);
}

/**
 * Connect to the server WebSocket to receive DESIGN_CHANGE events.
 */
export function startDesignChangeListener(serverUrl?: string): WebSocket {
  const url = serverUrl ?? getServerUrl();
  const wsUrl = url.replace(/^http/, 'ws') + '/ws-watcher';

  console.log(`[Watcher] Connecting to ${wsUrl} for Design → Code events...`);

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('[Watcher] Connected to server for Design → Code relay');
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'DESIGN_CHANGE' && msg.payload) {
        await handleDesignChange(msg.payload);
      } else if (msg.type === 'CONNECTED') {
        console.log(`[Watcher] Server version: ${msg.version}`);
      }
    } catch (err) {
      console.error('[Watcher] Error processing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Watcher] Design → Code connection closed, reconnecting in 5s...');
    setTimeout(() => startDesignChangeListener(serverUrl), 5000);
  });

  ws.on('error', (err: Error) => {
    console.error('[Watcher] Design → Code connection error:', err.message);
  });

  return ws;
}
