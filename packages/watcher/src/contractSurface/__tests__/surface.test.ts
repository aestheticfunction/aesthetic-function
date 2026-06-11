/**
 * @aesthetic-function/watcher - contractSurface/__tests__/surface.test.ts
 *
 * Mapping tests: dspack component entries → ContractComponentData
 * (SurfaceProp inventory + enum-derived variants), name/ID lookup rules.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadContract } from '../loadContract.js';
import {
  findContractComponent,
  listContractComponentNames,
  toContractId,
} from '../surface.js';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '__fixtures__', 'contract', 'shadcn-demo.dspack.json',
);

const doc = loadContract(fixturePath);

describe('toContractId', () => {
  it('converts PascalCase to kebab-case', () => {
    expect(toContractId('AlertDialog')).toBe('alert-dialog');
    expect(toContractId('Button')).toBe('button');
    expect(toContractId('CardHeader')).toBe('card-header');
  });

  it('strips characters outside the dspack ID grammar', () => {
    expect(toContractId('My Component_v2!')).toBe('my-component-v2');
  });
});

describe('findContractComponent', () => {
  it('matches by display name, case-insensitively', () => {
    const button = findContractComponent(doc, 'Button');
    expect(button).not.toBeNull();
    expect(button!.id).toBe('button');
    expect(button!.name).toBe('Button');

    expect(findContractComponent(doc, 'button')!.id).toBe('button');
    expect(findContractComponent(doc, 'BUTTON')!.id).toBe('button');
  });

  it('falls back to kebab-converted ID lookup', () => {
    const header = findContractComponent(doc, 'CardHeader');
    expect(header).not.toBeNull();
    expect(header!.id).toBe('card-header');
  });

  it('returns null for components not in the contract', () => {
    expect(findContractComponent(doc, 'Tooltip')).toBeNull();
  });

  it('maps enum props to SurfaceProp with values', () => {
    const button = findContractComponent(doc, 'Button')!;
    const variant = button.props.find(p => p.name === 'variant');
    expect(variant).toBeDefined();
    expect(variant!.type).toBe('enum');
    expect(variant!.values).toEqual([
      'default', 'destructive', 'outline', 'secondary', 'ghost', 'link',
    ]);
  });

  it('maps non-enum props without values', () => {
    const button = findContractComponent(doc, 'Button')!;
    const asChild = button.props.find(p => p.name === 'asChild');
    expect(asChild).toBeDefined();
    expect(asChild!.type).toBe('boolean');
    expect(asChild!.values).toBeUndefined();
  });

  it('derives variants as the union of all enum prop values', () => {
    const button = findContractComponent(doc, 'Button')!;
    // variant enum (6 values) + size enum, deduplicated ('default' appears in both)
    expect(button.variants).toContain('destructive');
    expect(button.variants).toContain('ghost');
    expect(button.variants).toContain('sm');
    expect(button.variants).toContain('icon');
    expect(button.variants.filter(v => v === 'default')).toHaveLength(1);
  });
});

describe('listContractComponentNames', () => {
  it('lists display names of all contract components', () => {
    const names = listContractComponentNames(doc);
    expect(names).toContain('Button');
    expect(names).toContain('CardHeader');
    expect(names.length).toBe(Object.keys(doc.components ?? {}).length);
  });

  it('returns an empty list for a contract without components', () => {
    expect(listContractComponentNames({ dspack: '0.1', name: 'Empty' })).toEqual([]);
  });
});
