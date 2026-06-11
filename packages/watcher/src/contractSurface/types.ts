/**
 * @aesthetic-function/watcher - contractSurface/types.ts
 *
 * Minimal dspack document types — only the parts the contract surface reads
 * for component/prop/variant drift comparison. The full document is schema-
 * validated at load time (loadContract.ts); these types deliberately use
 * index signatures so unrecognized spec sections pass through untouched,
 * matching the dspack conformance rule that consumers MUST ignore properties
 * they do not recognize.
 */

/**
 * A prop declared by a dspack component entry (dspack v0.2 §6.2).
 */
export interface DspackPropDescriptor {
  type: string;
  description?: string;
  values?: unknown[];
  default?: unknown;
  required?: boolean;
  [key: string]: unknown;
}

/**
 * A component entry in a dspack document (dspack v0.2 §6.1).
 */
export interface DspackComponentEntry {
  name: string;
  description?: string;
  props?: Record<string, DspackPropDescriptor>;
  deprecated?: boolean;
  [key: string]: unknown;
}

/**
 * A dspack document (v0.1 or v0.2). Only `dspack`, `name`, and `components`
 * are read by the contract surface; everything else passes through.
 */
export interface DspackDocument {
  dspack: string;
  name: string;
  components?: Record<string, DspackComponentEntry>;
  [key: string]: unknown;
}
