/**
 * @aesthetic-function/watcher
 *
 * RUNTIME: Local Node.js
 * RESPONSIBILITIES:
 *   - Watches React source files on disk
 *   - Converts code → Intent Model
 *   - Converts Intent + Design Tokens → Figma Operations
 *   - Sends messages to the Server
 *
 * CAN: Read file system, access LLMs
 * CANNOT: Directly communicate with Figma Plugin
 */

import { PROTOCOL_VERSION } from '@aesthetic-function/shared';
import { startWatcher } from './watch.js';

console.log(`[Watcher] Starting with protocol version: ${PROTOCOL_VERSION}`);

// Get paths from command line or use defaults
const args = process.argv.slice(2);

// Default: Watch demo-app folder (relative to workspace root)
// The workspace root is 3 levels up from this file
const defaultWatchPath = new URL('../../../demo-app', import.meta.url).pathname;
const watchPaths = args.length > 0 ? args : [defaultWatchPath];

// Server URL from environment or default
const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';

console.log(`[Watcher] Server URL: ${serverUrl}`);
console.log(`[Watcher] Watching paths: ${watchPaths.join(', ')}`);

// Start the watcher
const watcher = startWatcher(watchPaths, serverUrl);

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\n[Watcher] Shutting down...');
  await watcher.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Watcher] Received SIGTERM, shutting down...');
  await watcher.close();
  process.exit(0);
});
