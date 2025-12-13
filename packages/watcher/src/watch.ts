/**
 * @aesthetic-function/watcher - watch.ts
 *
 * Chokidar-based file watcher that monitors React source files for changes.
 *
 * PIPELINE:
 *   File change → Parse @figma markers → IntentModel → FigmaOps → Server → Plugin
 *
 * FEATURES:
 * - Configurable watch path via WATCH_PATH env var
 * - Debounced events to avoid double triggers on save
 * - Only processes files with @figma markers
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

// =============================================================================
// CONFIGURATION
// =============================================================================

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

/**
 * Send Figma operations to the server.
 */
async function sendOperationsToServer(
  operations: unknown[],
  requestId: string,
  serverUrl: string
): Promise<SendResult> {
  const response = await fetch(`${serverUrl}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations, requestId }),
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
 * Process a changed file through the full pipeline.
 */
async function processFile(filePath: string, serverUrl: string): Promise<void> {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);

  console.log(`[Watcher] Processing: ${relativePath}`);

  try {
    // Read file content
    const content = await readFile(absolutePath, 'utf-8');

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

    console.log(`[Watcher] Found ${parseResult.intents.length} intent(s)`);

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
    const requestId = `watch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const result = await sendOperationsToServer(
      transformResult.operations,
      requestId,
      serverUrl
    );

    console.log(
      `[Watcher] ✓ Sent to server (${result.clientsNotified} client(s) notified)`
    );
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
