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
import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
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
// FILE PROCESSING
// =============================================================================

/**
 * Process a changed file using marker-based parsing.
 * This is the default mode when USE_LLM_ANALYZER is not set.
 */
async function processFileWithMarkers(
  content: string,
  relativePath: string,
  serverUrl: string
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

  // Transform intents to Figma operations
  const tokenContext = getDefaultTokenContext();
  const model = createIntentModel(parseResult.intents, relativePath);
  const transformResult = intentToFigmaOps(model, tokenContext);

  console.log(`[Watcher] Generated ${transformResult.operations.length} operation(s)`);

  if (transformResult.resolvedTokens.length > 0) {
    transformResult.resolvedTokens.forEach((t) => {
      if (t.tokenName) {
        console.log(`[Watcher]   Token: ${t.input} → ${t.resolved}`);
      }
    });
  }

  // Send to server
  const requestId = `watch-marker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const result = await sendOperationsToServer(
    transformResult.operations,
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
  relativePath: string,
  serverUrl: string
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

  // Transform intents to Figma operations (same as marker mode)
  const transformResult = intentToFigmaOps(analyzeResult.model, tokenContext);

  console.log(`[Watcher] Generated ${transformResult.operations.length} operation(s)`);

  if (transformResult.resolvedTokens.length > 0) {
    transformResult.resolvedTokens.forEach((t) => {
      if (t.tokenName) {
        console.log(`[Watcher]   Token: ${t.input} → ${t.resolved}`);
      }
    });
  }

  // Send to server
  const requestId = `watch-llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Determine the LLM source for audit trail
  const llmSource = analyzeResult.source === 'llm'
    ? (process.env.LLM_PROVIDER?.toLowerCase() === 'anthropic' ? 'anthropic' : 'openai')
    : analyzeResult.source;

  const result = await sendOperationsToServer(
    transformResult.operations,
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

  console.log(`[Watcher] Processing: ${relativePath}`);

  try {
    // Read file content
    const content = await readFile(absolutePath, 'utf-8');

    // Check feature flag
    if (isLLMAnalyzerEnabled()) {
      if (!isLLMAnalyzerAvailable()) {
        console.warn(`[Watcher] USE_LLM_ANALYZER=true but no API key configured`);
        console.warn(`[Watcher] Falling back to marker-based parsing`);
        await processFileWithMarkers(content, relativePath, serverUrl);
      } else {
        // Guard: skip LLM if no markers and LLM_ANALYZE_ALL is not enabled
        const hasMarkers = hasFigmaMarkers(content);
        if (!hasMarkers && !isLLMAnalyzeAllEnabled()) {
          console.log(`[Watcher] LLM mode: no @figma markers and LLM_ANALYZE_ALL!=true, skipping`);
          return;
        }

        // Try LLM, fall back to markers on any error
        try {
          await processFileWithLLM(content, relativePath, serverUrl);
        } catch (llmError) {
          const errorMsg = llmError instanceof Error ? llmError.message : String(llmError);
          console.warn(`[Watcher] LLM failed, falling back to marker-based parsing: ${errorMsg}`);
          if (hasMarkers) {
            await processFileWithMarkers(content, relativePath, serverUrl);
          } else {
            console.log(`[Watcher] No @figma markers to fall back to, skipping`);
          }
        }
      }
    } else {
      await processFileWithMarkers(content, relativePath, serverUrl);
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
