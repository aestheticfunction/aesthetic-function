/**
 * @aesthetic-function/shared
 *
 * This package contains shared types, protocol definitions, and utilities
 * used across all three runtimes: Watcher, Server, and Figma Plugin.
 */

export * from './protocol.js';
export * from './compose.js';
export * from './config.js';
export * from './policy.js';
export * from './designAdapter.js';
export * from './surfaceMetadata.js';
export {
  loadAfConfig,
  findConfigFile,
  loadConfigFile,
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
} from './configLoader.js';
