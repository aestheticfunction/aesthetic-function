/**
 * @aesthetic-function/watcher - contractSurface/index.ts
 *
 * Public surface of the dspack contract module: load + validate a contract
 * file, then read component/prop/variant data for drift comparison.
 * Read-only by construction — no write paths exist in this module.
 */

export { loadContract, SUPPORTED_DSPACK_VERSIONS } from './loadContract.js';
export {
  findContractComponent,
  listContractComponentNames,
  toContractId,
  CONTRACT_SOURCE_ID,
  CONTRACT_SURFACE_METADATA,
} from './surface.js';
export type { DspackDocument, DspackComponentEntry, DspackPropDescriptor } from './types.js';
