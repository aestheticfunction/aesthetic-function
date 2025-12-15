/**
 * @aesthetic-function/watcher - materialize/__tests__/materializeAstPatch.test.ts
 *
 * Tests for AST-based patch generation (Phase 7A + 7B).
 *
 * Covers:
 * - Text literal replacement in JSX children
 * - backgroundColor literal replacement in inline style object
 * - Layout property replacement (gap, padding, margin, width, height)
 * - Refusal to change when value is not auto-writable
 * - Output formatting stability (snapshot)
 */

import { describe, it, expect, vi } from 'vitest';
import { computeAstWriteOps, materializeAstPatch } from '../materializeAstPatch.js';
import type { DesignOverrides } from '../../reconcile/types.js';

// =============================================================================
// MOCK CONFIG
// =============================================================================

// Mock the config module to control AST_WRITE_ALLOW
vi.mock('../config.js', async () => {
  const actual = await vi.importActual('../config.js');
  return {
    ...actual,
    isAstWriteOpAllowed: (op: string) => op === 'SET_TEXT' || op === 'SET_FILL' || op === 'SET_LAYOUT',
  };
});

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Create a simple component with a @figma marker.
 */
function wrapWithMarker(nodeName: string, componentCode: string): string {
  return `
// @figma node="${nodeName}"
export ${componentCode}
`.trim();
}

// =============================================================================
// TEXT LITERAL REPLACEMENT TESTS
// =============================================================================

describe('AST Patch - Text Literal Replacement', () => {
  it('should create SET_TEXT operation for JSX text literal', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton() {
        return <button>Click Me</button>;
      }`
    );

    const overrides: DesignOverrides = {
      TestButton: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'Submit',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(1);
    expect(ops[0].op).toBe('SET_TEXT');
    expect(ops[0].nodeName).toBe('TestButton');
    expect(ops[0].before).toBe('Click Me');
    expect(ops[0].after).toBe('Submit');
    expect(ops[0].writable).toBe(true);
    expect(ops[0].reason).toBe('literal');
  });

  it('should create multiple SET_TEXT operations for multiple text literals', () => {
    const code = wrapWithMarker(
      'TestCard',
      `function TestCard() {
        return (
          <div>
            <h1>Title</h1>
            <p>Description</p>
          </div>
        );
      }`
    );

    const overrides: DesignOverrides = {
      TestCard: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'New Title',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    // Both "Title" and "Description" differ from "New Title"
    expect(ops.length).toBe(2);
    expect(ops.every((op) => op.op === 'SET_TEXT')).toBe(true);
    expect(ops.every((op) => op.writable)).toBe(true);
  });

  it('should not create operation when text already matches', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton() {
        return <button>Submit</button>;
      }`
    );

    const overrides: DesignOverrides = {
      TestButton: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'Submit',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(0);
  });

  it('should mark variable reference as not-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton({ label }: { label: string }) {
        return <button>{label}</button>;
      }`
    );

    const overrides: DesignOverrides = {
      TestButton: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'Submit',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(1);
    expect(ops[0].writable).toBe(false);
    expect(ops[0].reason).toBe('variable-reference');
  });

  it('should mark function call as not-writable', () => {
    const code = wrapWithMarker(
      'TestLabel',
      `function TestLabel() {
        return <span>{getLabel()}</span>;
      }`
    );

    const overrides: DesignOverrides = {
      TestLabel: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'New Label',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(1);
    expect(ops[0].writable).toBe(false);
    expect(ops[0].reason).toBe('function-call');
  });
});

// =============================================================================
// FILL (BACKGROUNDCOLOR) REPLACEMENT TESTS
// =============================================================================

describe('AST Patch - Fill Replacement', () => {
  it('should create SET_FILL operation for backgroundColor literal', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ backgroundColor: "#FF0000" }}>Box</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        fill: '#00FF00',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(1);
    expect(ops[0].op).toBe('SET_FILL');
    expect(ops[0].nodeName).toBe('TestBox');
    expect(ops[0].before).toBe('#FF0000');
    expect(ops[0].after).toBe('#00FF00');
    expect(ops[0].writable).toBe(true);
    expect(ops[0].reason).toBe('literal');
  });

  it('should not create operation when fill already matches', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ backgroundColor: "#00FF00" }}>Box</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        fill: '#00FF00',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(0);
  });

  it('should mark external style variable as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={boxStyles}>Box</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        fill: '#00FF00',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(1);
    expect(ops[0].writable).toBe(false);
    expect(ops[0].reason).toBe('external-style');
  });

  it('should mark spread in style object as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ ...baseStyles }}>Box</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        fill: '#00FF00',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(1);
    expect(ops[0].writable).toBe(false);
    expect(ops[0].reason).toBe('spread');
  });

  it('should mark variable backgroundColor value as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        const color = "#FF0000";
        return <div style={{ backgroundColor: color }}>Box</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        fill: '#00FF00',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(1);
    expect(ops[0].writable).toBe(false);
    expect(ops[0].reason).toBe('variable-reference');
  });
});

// =============================================================================
// LAYOUT REPLACEMENT TESTS (Phase 7B)
// =============================================================================

describe('AST Patch - Layout Replacement', () => {
  it('should create SET_LAYOUT operation for gap numeric literal', () => {
    const code = wrapWithMarker(
      'TestContainer',
      `function TestContainer() {
        return <div style={{ gap: 8 }}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestContainer: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { gap: 16 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(1);
    expect(layoutOps[0].nodeName).toBe('TestContainer');
    expect(layoutOps[0].before).toBe('8');
    expect(layoutOps[0].after).toBe('16');
    expect(layoutOps[0].writable).toBe(true);
    expect(layoutOps[0].reason).toBe('literal');
    expect(layoutOps[0].layoutKey).toBe('gap');
  });

  it('should create SET_LAYOUT operation for padding string literal', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ padding: "12px" }}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { padding: '24px' },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(1);
    expect(layoutOps[0].before).toBe('12px');
    expect(layoutOps[0].after).toBe('24px');
    expect(layoutOps[0].writable).toBe(true);
    expect(layoutOps[0].layoutKey).toBe('padding');
  });

  it('should create multiple SET_LAYOUT operations for multiple properties', () => {
    const code = wrapWithMarker(
      'TestCard',
      `function TestCard() {
        return <div style={{ gap: 8, padding: 16, margin: 4 }}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestCard: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { gap: 12, padding: 24, margin: 8 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(3);
    expect(layoutOps.every((op) => op.writable)).toBe(true);

    const gapOp = layoutOps.find((op) => op.layoutKey === 'gap');
    const paddingOp = layoutOps.find((op) => op.layoutKey === 'padding');
    const marginOp = layoutOps.find((op) => op.layoutKey === 'margin');

    expect(gapOp?.before).toBe('8');
    expect(gapOp?.after).toBe('12');
    expect(paddingOp?.before).toBe('16');
    expect(paddingOp?.after).toBe('24');
    expect(marginOp?.before).toBe('4');
    expect(marginOp?.after).toBe('8');
  });

  it('should not create operation when layout value already matches', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ gap: 16 }}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { gap: 16 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(0);
  });

  it('should mark variable reference layout value as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        const spacing = 8;
        return <div style={{ gap: spacing }}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { gap: 16 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(1);
    expect(layoutOps[0].writable).toBe(false);
    expect(layoutOps[0].reason).toBe('variable-reference');
  });

  it('should mark function call layout value as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ padding: getPadding() }}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { padding: 24 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(1);
    expect(layoutOps[0].writable).toBe(false);
    expect(layoutOps[0].reason).toBe('function-call');
  });

  it('should mark spread in style object as not-writable for layout', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ ...baseStyles }}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { gap: 16 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(1);
    expect(layoutOps[0].writable).toBe(false);
    expect(layoutOps[0].reason).toBe('spread');
  });

  it('should mark external style variable as not-writable for layout', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={boxStyles}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { gap: 16, padding: 24 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    // Reports for each layout key that has an override
    expect(layoutOps.length).toBe(2);
    expect(layoutOps.every((op) => !op.writable)).toBe(true);
    expect(layoutOps.every((op) => op.reason === 'external-style')).toBe(true);
  });

  it('should handle width and height layout properties', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ width: 100, height: 50 }}>Content</div>;
      }`
    );

    const overrides: DesignOverrides = {
      TestBox: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        layout: { width: 200, height: 100 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(2);

    const widthOp = layoutOps.find((op) => op.layoutKey === 'width');
    const heightOp = layoutOps.find((op) => op.layoutKey === 'height');

    expect(widthOp?.before).toBe('100');
    expect(widthOp?.after).toBe('200');
    expect(widthOp?.writable).toBe(true);

    expect(heightOp?.before).toBe('50');
    expect(heightOp?.after).toBe('100');
    expect(heightOp?.writable).toBe(true);
  });
});

// =============================================================================
// MIXED TEXT AND FILL TESTS
// =============================================================================

describe('AST Patch - Mixed Operations', () => {
  it('should create both SET_TEXT and SET_FILL operations', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton() {
        return <button style={{ backgroundColor: "#3B82F6" }}>Click Me</button>;
      }`
    );

    const overrides: DesignOverrides = {
      TestButton: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'Submit',
        fill: '#10B981',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(2);
    
    const textOp = ops.find((op) => op.op === 'SET_TEXT');
    const fillOp = ops.find((op) => op.op === 'SET_FILL');

    expect(textOp).toBeDefined();
    expect(textOp?.before).toBe('Click Me');
    expect(textOp?.after).toBe('Submit');
    expect(textOp?.writable).toBe(true);

    expect(fillOp).toBeDefined();
    expect(fillOp?.before).toBe('#3B82F6');
    expect(fillOp?.after).toBe('#10B981');
    expect(fillOp?.writable).toBe(true);
  });

  it('should handle partial writability', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton({ label }: { label: string }) {
        return <button style={{ backgroundColor: "#3B82F6" }}>{label}</button>;
      }`
    );

    const overrides: DesignOverrides = {
      TestButton: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'Submit',
        fill: '#10B981',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    expect(ops.length).toBe(2);
    
    const textOp = ops.find((op) => op.op === 'SET_TEXT');
    const fillOp = ops.find((op) => op.op === 'SET_FILL');

    expect(textOp?.writable).toBe(false); // Variable reference
    expect(fillOp?.writable).toBe(true); // Literal
  });
});

// =============================================================================
// MATERIALIZE AST PATCH TESTS
// =============================================================================

describe('materializeAstPatch', () => {
  it('should return patch result with operations', async () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton() {
        return <button style={{ backgroundColor: "#3B82F6" }}>Click Me</button>;
      }`
    );

    const overrides: DesignOverrides = {
      TestButton: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'Submit',
        fill: '#10B981',
      },
    };

    const result = await materializeAstPatch({
      relativePath: 'test.tsx',
      repoRoot: '/tmp/test-repo',
      content: code,
      overrides,
      dryRun: true,
    });

    expect(result.mode).toBe('patch');
    expect(result.dryRun).toBe(true);
    expect(result.applied).toBe(0); // Patch mode doesn't apply
    expect(result.operations.length).toBe(2);
    expect(result.operations.filter((op) => op.writable).length).toBe(2);
  });

  it('should return correct summary counts', async () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton({ label }: { label: string }) {
        return <button style={{ backgroundColor: bgColor }}>{label}</button>;
      }`
    );

    const overrides: DesignOverrides = {
      TestButton: {
        nodeId: 'node-1',
        lastUpdated: new Date().toISOString(),
        text: 'Submit',
        fill: '#10B981',
      },
    };

    const result = await materializeAstPatch({
      relativePath: 'test.tsx',
      repoRoot: '/tmp/test-repo',
      content: code,
      overrides,
      dryRun: true,
    });

    expect(result.skipped).toBe(2); // Both are not writable
    expect(result.operations.every((op) => !op.writable)).toBe(true);
  });
});

// =============================================================================
// SNAPSHOT TESTS
// =============================================================================

describe('AST Patch - Output Stability', () => {
  it('should produce stable operation output', () => {
    const code = wrapWithMarker(
      'LoginButton',
      `function LoginButton() {
        return (
          <button style={{ backgroundColor: "#3B82F6", color: "white" }}>
            Sign In
          </button>
        );
      }`
    );

    const overrides: DesignOverrides = {
      LoginButton: {
        nodeId: 'node-1',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        text: 'Log In',
        fill: '#10B981',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    // Snapshot the operations for stability
    expect(ops).toMatchSnapshot();
  });

  it('should produce stable output for mixed writable/not-writable', () => {
    const code = wrapWithMarker(
      'DynamicButton',
      `function DynamicButton({ text, color }: { text: string; color: string }) {
        return (
          <button style={{ backgroundColor: color }}>
            {text}
          </button>
        );
      }`
    );

    const overrides: DesignOverrides = {
      DynamicButton: {
        nodeId: 'node-1',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        text: 'Submit',
        fill: '#10B981',
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    // All should be not-writable
    expect(ops.every((op) => !op.writable)).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it('should produce stable output for layout operations', () => {
    const code = wrapWithMarker(
      'LayoutContainer',
      `function LayoutContainer() {
        return (
          <div style={{ gap: 8, padding: 16, margin: 4, width: 100, height: 50 }}>
            Content
          </div>
        );
      }`
    );

    const overrides: DesignOverrides = {
      LayoutContainer: {
        nodeId: 'node-1',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        layout: { gap: 12, padding: 24, margin: 8, width: 200, height: 100 },
      },
    };

    const ops = computeAstWriteOps(code, 'test.tsx', overrides);

    // All layout ops should be writable
    const layoutOps = ops.filter((op) => op.op === 'SET_LAYOUT');
    expect(layoutOps.length).toBe(5);
    expect(layoutOps.every((op) => op.writable)).toBe(true);
    expect(layoutOps).toMatchSnapshot();
  });
});
