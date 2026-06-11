/**
 * @aesthetic-function/watcher - contractSurface/__tests__/loadContract.test.ts
 *
 * Loader tests: valid v0.1/v0.2 documents load; bad files are rejected
 * with actionable errors. Mirrors ds-mcp loader semantics.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { loadContract } from '../loadContract.js';

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '__fixtures__', 'contract',
);

describe('loadContract', () => {
  it('loads the shadcn-demo v0.2 fixture', () => {
    const doc = loadContract(join(fixtureDir, 'shadcn-demo.dspack.json'));
    expect(doc.dspack).toBe('0.2');
    expect(doc.name).toBeTruthy();
    expect(Object.keys(doc.components ?? {})).toContain('button');
  });

  it('loads a minimal v0.1 document (only dspack + name)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'af-contract-'));
    const file = join(dir, 'minimal.dspack.json');
    writeFileSync(file, JSON.stringify({ dspack: '0.1', name: 'Minimal' }));
    const doc = loadContract(file);
    expect(doc.dspack).toBe('0.1');
    expect(doc.name).toBe('Minimal');
  });

  it('rejects an unsupported dspack version', () => {
    expect(() => loadContract(join(fixtureDir, 'invalid-version.dspack.json')))
      .toThrow(/Unsupported dspack version '0\.9'/);
  });

  it('rejects a missing file with a readable error', () => {
    expect(() => loadContract(join(fixtureDir, 'does-not-exist.dspack.json')))
      .toThrow(/Failed to read dspack contract file/);
  });

  it('rejects malformed JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'af-contract-'));
    const file = join(dir, 'broken.dspack.json');
    writeFileSync(file, '{ not json');
    expect(() => loadContract(file)).toThrow(/Invalid JSON in dspack contract file/);
  });

  it('rejects a schema-invalid document with instance paths', () => {
    expect(() => loadContract(join(fixtureDir, 'invalid-schema.dspack.json')))
      .toThrow(/dspack schema validation failed[\s\S]*\/components\/button\/props\/variant\/values/);
  });
});
