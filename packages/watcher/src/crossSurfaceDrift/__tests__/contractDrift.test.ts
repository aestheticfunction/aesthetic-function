/**
 * @aesthetic-function/watcher - crossSurfaceDrift/__tests__/contractDrift.test.ts
 *
 * Contract-surface drift tests: component/prop/variant comparison against a
 * dspack contract, staleness direction semantics, and the regression guard
 * that no-contract reports are shape-identical to pre-contract behavior.
 */

import { describe, it, expect } from 'vitest';
import { analyzeCrossSurfaceDrift } from '../analyze.js';
import type { CodeSurfaceData } from '../analyze.js';
import type { ContractComponentData } from '@aesthetic-function/shared/crossSurfaceDrift';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeContractButton(overrides?: Partial<ContractComponentData>): ContractComponentData {
  return {
    id: 'button',
    name: 'Button',
    props: [
      { name: 'variant', type: 'enum', values: ['default', 'destructive', 'ghost'] },
      { name: 'size', type: 'enum', values: ['sm', 'lg'] },
      { name: 'asChild', type: 'boolean' },
    ],
    variants: ['default', 'destructive', 'ghost', 'sm', 'lg'],
    ...overrides,
  };
}

function makeCodeButton(overrides?: Partial<CodeSurfaceData>): CodeSurfaceData {
  return {
    props: ['variant', 'size', 'asChild'],
    variants: ['default', 'destructive', 'ghost', 'sm', 'lg'],
    ...overrides,
  };
}

// =============================================================================
// AGREEMENT
// =============================================================================

describe('contract surface — agreement', () => {
  it('produces no findings when contract and code agree', () => {
    const report = analyzeCrossSurfaceDrift('Button', null, null, makeCodeButton(), {
      queriedSurfaces: ['code', 'contract'],
      contractData: makeContractButton(),
    });

    expect(report.findings).toEqual([]);
    expect(report.severity).toBe('none');
    expect(report.surfaces.contract).toBeDefined();
    expect(report.surfaces.contract!.source).toBe('dspack-contract');
    expect(report.queriedSurfaces).toContain('contract');
  });
});

// =============================================================================
// CONTRACT → CODE DRIFT (code regressed against the contract)
// =============================================================================

describe('contract surface — code regressions', () => {
  it('flags a contract variant missing from code as missing-in-code (warn, high)', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button', null, null,
      makeCodeButton({ variants: ['default', 'ghost', 'sm', 'lg'] }), // no 'destructive'
      { queriedSurfaces: ['code', 'contract'], contractData: makeContractButton() },
    );

    const finding = report.findings.find(f => f.field === 'variant:destructive');
    expect(finding).toBeDefined();
    expect(finding!.type).toBe('missing-in-code');
    expect(finding!.severity).toBe('warn');
    expect(finding!.confidence).toBe('high');
    expect(finding!.contractValue).toBe('destructive');
    expect(report.severity).toBe('warn');
  });

  it('flags a contract prop missing from code as missing-in-code (warn)', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button', null, null,
      makeCodeButton({ props: ['variant', 'size'] }), // no 'asChild'
      { queriedSurfaces: ['code', 'contract'], contractData: makeContractButton() },
    );

    const finding = report.findings.find(f => f.field === 'prop:asChild');
    expect(finding).toBeDefined();
    expect(finding!.type).toBe('missing-in-code');
    expect(finding!.severity).toBe('warn');
  });

  it('flags a declared component absent from code', () => {
    const report = analyzeCrossSurfaceDrift('Button', null, null, null, {
      queriedSurfaces: ['code', 'contract'],
      contractData: makeContractButton(),
    });

    const finding = report.findings.find(f => f.field === 'component');
    expect(finding).toBeDefined();
    expect(finding!.type).toBe('missing-in-code');
    expect(finding!.contractValue).toBe('Button');
  });

  it('compares prop names case-insensitively', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button', null, null,
      makeCodeButton({ props: ['Variant', 'SIZE', 'aschild'] }),
      { queriedSurfaces: ['code', 'contract'], contractData: makeContractButton() },
    );

    expect(report.findings.filter(f => f.field.startsWith('prop:'))).toEqual([]);
  });
});

// =============================================================================
// CODE → CONTRACT STALENESS (snapshot out of date)
// =============================================================================

describe('contract surface — staleness signals', () => {
  it('tags code props absent from the contract as contract-staleness (info)', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button', null, null,
      makeCodeButton({ props: ['variant', 'size', 'asChild', 'loading'] }),
      { queriedSurfaces: ['code', 'contract'], contractData: makeContractButton() },
    );

    const finding = report.findings.find(f => f.field === 'contract-staleness:prop:loading');
    expect(finding).toBeDefined();
    expect(finding!.type).toBe('missing-in-contract');
    expect(finding!.severity).toBe('info');
    expect(finding!.codeValue).toBe('loading');
    expect(finding!.message).toContain('may be out of date');
  });

  it('tags code variants absent from the contract as contract-staleness (info)', () => {
    const report = analyzeCrossSurfaceDrift(
      'Button', null, null,
      makeCodeButton({ variants: [...makeCodeButton().variants, 'outline'] }),
      { queriedSurfaces: ['code', 'contract'], contractData: makeContractButton() },
    );

    const finding = report.findings.find(f => f.field === 'contract-staleness:variant:outline');
    expect(finding).toBeDefined();
    expect(finding!.type).toBe('missing-in-contract');
    expect(finding!.severity).toBe('info');
  });

  it('reports a component undeclared by the contract as missing-in-contract (info)', () => {
    const report = analyzeCrossSurfaceDrift('Tooltip', null, null, makeCodeButton(), {
      queriedSurfaces: ['code', 'contract'],
      contractData: null, // queried, not found in contract
    });

    const finding = report.findings.find(f => f.type === 'missing-in-contract');
    expect(finding).toBeDefined();
    expect(finding!.field).toBe('component');
    expect(finding!.severity).toBe('info');
    expect(report.surfaces.contract).toBeDefined(); // empty snapshot recorded
    expect(report.surfaces.contract!.props).toEqual([]);
  });
});

// =============================================================================
// CONTRACT ↔ FIGMA
// =============================================================================

describe('contract surface — Figma comparison', () => {
  const figmaButton = {
    name: 'Button',
    nodeId: 'figma:1:100',
    type: 'component' as const,
    properties: {},
    unmappedProperties: [],
    componentPropertyDefinitions: {
      variant: { type: 'VARIANT' as const, variantOptions: ['default', 'ghost'] },
    },
  };

  it('flags contract variants missing from Figma (warn)', () => {
    const report = analyzeCrossSurfaceDrift('Button', figmaButton, null, null, {
      queriedSurfaces: ['figma', 'contract'],
      contractData: makeContractButton({ variants: ['default', 'ghost', 'destructive'] }),
    });

    const finding = report.findings.find(
      f => f.field === 'variant:destructive' && f.type === 'missing-in-figma',
    );
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warn');
    expect(finding!.contractValue).toBe('destructive');
  });

  it('flags Figma variants undeclared by the contract (info, no staleness prefix)', () => {
    const report = analyzeCrossSurfaceDrift('Button', figmaButton, null, null, {
      queriedSurfaces: ['figma', 'contract'],
      contractData: makeContractButton({ variants: ['default'] }),
    });

    const finding = report.findings.find(
      f => f.field === 'variant:ghost' && f.type === 'missing-in-contract',
    );
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
    expect(finding!.field.startsWith('contract-staleness:')).toBe(false);
  });
});

// =============================================================================
// REGRESSION GUARD — no-contract behavior unchanged
// =============================================================================

describe('contract surface — no-contract regression guard', () => {
  it('produces a report without contract members when contract is not queried', () => {
    const report = analyzeCrossSurfaceDrift('Button', null, null, makeCodeButton(), {
      queriedSurfaces: ['code'],
    });

    expect(report.surfaces.contract).toBeUndefined();
    expect(report.queriedSurfaces).not.toContain('contract');
    expect(report.findings.some(f => f.type === 'missing-in-contract')).toBe(false);
    expect(report.findings.some(f => f.contractValue !== undefined)).toBe(false);
    // Shape check: only the three legacy surface keys may appear
    expect(Object.keys(report.surfaces).every(k => ['figma', 'storybook', 'code'].includes(k))).toBe(true);
  });

  it('derives contract into queriedSurfaces only when contractData is supplied', () => {
    // Backward-compat derivation path (no explicit queriedSurfaces)
    const without = analyzeCrossSurfaceDrift('Button', null, null, makeCodeButton());
    expect(without.queriedSurfaces).toEqual(['code']);

    const withContract = analyzeCrossSurfaceDrift('Button', null, null, makeCodeButton(), {
      contractData: makeContractButton(),
    });
    expect(withContract.queriedSurfaces).toEqual(['code', 'contract']);
  });
});
