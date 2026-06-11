/**
 * @aesthetic-function/watcher - contractSurface/loadContract.ts
 *
 * Load and validate a dspack contract file (v0.1 or v0.2).
 *
 * WHY: `af design drift` can compare live surfaces (Figma, Storybook, code)
 * against the declared design-system contract — a dspack file committed to
 * source control. This loader is the only entry point for contract data.
 *
 * CONSTRAINTS:
 * - READ-ONLY. Reads one file from disk; never writes, never networks.
 * - Validates against the vendored dspack JSON Schemas (schema/) before
 *   any data is used. An invalid contract is rejected, not repaired.
 * - Loader/validation behavior mirrors the ds-mcp reference implementation
 *   so a file that loads in ds-mcp loads here, and vice versa.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- ajv/dist/2020 has broken ESM types
import { createRequire } from 'node:module';

import type { DspackDocument } from './types.js';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020');

const moduleDir = dirname(fileURLToPath(import.meta.url));

function readSchema(filename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(moduleDir, 'schema', filename), 'utf-8'));
}

const ajv = new Ajv2020({ allErrors: true, validateFormats: false });
const validateV01 = ajv.compile(readSchema('dspack.v0.1.schema.json'));
const validateV02 = ajv.compile(readSchema('dspack.v0.2.schema.json'));

export const SUPPORTED_DSPACK_VERSIONS = ['0.1', '0.2'] as const;

/**
 * Load a dspack contract file, validate it, and return the typed document.
 * Throws with a path-prefixed message on any failure (missing file, invalid
 * JSON, unsupported version, schema violation).
 */
export function loadContract(filePath: string): DspackDocument {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read dspack contract file: ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in dspack contract file ${filePath}: ${msg}`);
  }

  const peeked = parsed as { dspack?: unknown };
  const version = typeof peeked.dspack === 'string' ? peeked.dspack : null;

  if (!version || !(SUPPORTED_DSPACK_VERSIONS as readonly string[]).includes(version)) {
    throw new Error(
      `Unsupported dspack version '${peeked.dspack ?? '(missing)'}' in ${filePath}. ` +
      `Supported versions: ${SUPPORTED_DSPACK_VERSIONS.join(', ')}.`,
    );
  }

  const validate = version === '0.1' ? validateV01 : validateV02;

  if (!validate(parsed)) {
    const errors = (validate.errors as Array<{ instancePath?: string; message?: string }>)
      .map((e) => `  ${e.instancePath || '/'}: ${e.message}`)
      .join('\n');
    throw new Error(`dspack schema validation failed for ${filePath}:\n${errors}`);
  }

  return parsed as DspackDocument;
}
