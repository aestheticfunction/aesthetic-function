/**
 * @aesthetic-function/watcher - crossSurfaceDrift/__tests__/cliContractE2e.test.ts
 *
 * End-to-end: drive the drift CLI main() with the committed shadcn-demo
 * contract fixture against the react-demo-app code surface, with Figma and
 * Storybook unavailable. The demo Button (props: label/disabled/onClick, no
 * variant unions) guarantees deterministic contract findings.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { CrossSurfaceDriftReport } from '@aesthetic-function/shared/crossSurfaceDrift';
import { main } from '../cliCrossSurfaceDrift.js';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '__fixtures__', 'contract', 'shadcn-demo.dspack.json',
);

describe('af design drift --dspack (e2e)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Ensure the Figma adapter is not registered and Storybook stays local
    for (const key of ['FIGMA_ACCESS_TOKEN', 'FIGMA_FILE_KEY', 'STORYBOOK_URL']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function jsonOutput(): CrossSurfaceDriftReport[] {
    const jsonCall = logSpy.mock.calls.find(c => typeof c[0] === 'string' && c[0].startsWith('['));
    expect(jsonCall, 'expected a JSON array on stdout').toBeDefined();
    return JSON.parse(jsonCall![0] as string);
  }

  it('analyzes Button against contract + code with live surfaces down', async () => {
    const exitCode = await main(['Button', '--dspack', fixturePath, '--json']);

    // Findings are warn-level at most in this slice → exit 0
    expect(exitCode).toBe(0);

    const reports = jsonOutput();
    expect(reports).toHaveLength(1);
    const report = reports[0];

    expect(report.componentName).toBe('Button');
    expect(report.queriedSurfaces).toContain('contract');
    expect(report.queriedSurfaces).toContain('code');
    expect(report.surfaces.contract?.source).toBe('dspack-contract');

    // Contract declares variant/size/asChild — demo Button has none of them
    const missingProps = report.findings
      .filter(f => f.type === 'missing-in-code' && f.field.startsWith('prop:'))
      .map(f => f.field);
    expect(missingProps).toContain('prop:variant');
    expect(missingProps).toContain('prop:size');
    expect(missingProps).toContain('prop:asChild');

    // Demo Button props label/disabled/onClick are not in the contract → staleness
    const staleness = report.findings.filter(f => f.field.startsWith('contract-staleness:'));
    expect(staleness.map(f => f.field)).toContain('contract-staleness:prop:label');
    expect(staleness.every(f => f.severity === 'info')).toBe(true);

    // Contract enum variants missing from code
    const missingVariants = report.findings
      .filter(f => f.type === 'missing-in-code' && f.field.startsWith('variant:'))
      .map(f => f.field);
    expect(missingVariants).toContain('variant:destructive');
    expect(missingVariants).toContain('variant:ghost');

    expect(report.severity).toBe('warn');
  });

  it('prints the staleness remediation hint in human-readable mode', async () => {
    const exitCode = await main(['Button', '--dspack', fixturePath]);
    expect(exitCode).toBe(0);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Contract ✓');
    expect(output).toContain('Contract may be stale');
    expect(output).toContain('dspack-export generate');
  });

  it('exits 2 with a clear error for an invalid contract file', async () => {
    const invalidPath = join(dirname(fixturePath), 'invalid-schema.dspack.json');
    const exitCode = await main(['Button', '--dspack', invalidPath, '--json']);

    expect(exitCode).toBe(2);
    const errOutput = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(errOutput).toContain('dspack schema validation failed');
  });

  it('exits 2 when the contract file does not exist', async () => {
    const exitCode = await main(['Button', '--dspack', './no-such-file.dspack.json', '--json']);

    expect(exitCode).toBe(2);
    const errOutput = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(errOutput).toContain('dspack contract file not found');
  });

  it('uses the contract as inventory when no component is named and Storybook is down', async () => {
    const exitCode = await main(['--dspack', fixturePath, '--json']);
    expect(exitCode).toBe(0);

    const reports = jsonOutput();
    // One report per contract component (7 in the shadcn-demo fixture)
    expect(reports.length).toBe(7);
    expect(reports.map(r => r.componentName)).toContain('Button');
    expect(reports.every(r => r.queriedSurfaces.includes('contract'))).toBe(true);
  });
});
