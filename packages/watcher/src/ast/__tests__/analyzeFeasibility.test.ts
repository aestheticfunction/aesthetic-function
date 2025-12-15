/**
 * @aesthetic-function/watcher - ast/__tests__/analyzeFeasibility.test.ts
 *
 * Tests for the write feasibility analysis.
 *
 * Covers:
 * - Literal vs variable values
 * - Inline style literals vs expressions
 * - Text nodes vs computed children
 * - className handling (always not-writable)
 * - Boolean props
 * - Various expression types
 */

import { describe, it, expect } from 'vitest';
import { analyzeWriteFeasibility } from '../analyzeFeasibility.js';

// =============================================================================
// HELPER FUNCTIONS
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

/**
 * Find values by path in a feasibility report.
 */
function findValuesByPath(
  report: ReturnType<typeof analyzeWriteFeasibility>,
  nodeName: string,
  pathPrefix: string
) {
  const nodeReport = report.reports.find((r) => r.nodeName === nodeName);
  if (!nodeReport) return { auto: [], conditional: [], notWritable: [] };

  return {
    auto: nodeReport.autoWritable.filter((v) => v.path.startsWith(pathPrefix)),
    conditional: nodeReport.conditionallyWritable.filter((v) => v.path.startsWith(pathPrefix)),
    notWritable: nodeReport.notWritable.filter((v) => v.path.startsWith(pathPrefix)),
  };
}

// =============================================================================
// LITERAL VS VARIABLE VALUES
// =============================================================================

describe('Write Feasibility - Literal vs Variable Values', () => {
  it('should mark string literal as auto-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton() {
        return <button title="Click me">Submit</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestButton', 'text');

    expect(values.auto.length).toBeGreaterThan(0);
    const titleValue = values.auto.find((v) => v.path === 'text.title');
    expect(titleValue).toBeDefined();
    expect(titleValue?.value).toBe('Click me');
    expect(titleValue?.reason).toBe('literal');
  });

  it('should mark variable reference as not-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton({ label }: { label: string }) {
        return <button title={label}>Submit</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestButton', 'text.title');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('variable-reference');
    expect(values.notWritable[0].explanation).toContain('label');
  });

  it('should mark props.value as not-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton(props: { text: string }) {
        return <button title={props.text}>Submit</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestButton', 'text.title');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('variable-reference');
  });

  it('should mark numeric literal as auto-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ width: 100, height: 200 }}>Box</div>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestBox', 'layout');

    const widthValue = values.auto.find((v) => v.path === 'layout.width');
    const heightValue = values.auto.find((v) => v.path === 'layout.height');

    expect(widthValue).toBeDefined();
    expect(widthValue?.value).toBe(100);
    expect(heightValue).toBeDefined();
    expect(heightValue?.value).toBe(200);
  });

  it('should mark function call result as not-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton() {
        return <button title={getTitle()}>Submit</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestButton', 'text.title');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('function-call');
    expect(values.notWritable[0].explanation).toContain('getTitle');
  });
});

// =============================================================================
// INLINE STYLE LITERALS VS EXPRESSIONS
// =============================================================================

describe('Write Feasibility - Inline Style Literals vs Expressions', () => {
  it('should mark inline style literal as auto-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ backgroundColor: "#FF0000" }}>Box</div>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestBox', 'visual');

    expect(values.auto.length).toBe(1);
    expect(values.auto[0].path).toBe('visual.backgroundColor');
    expect(values.auto[0].value).toBe('#FF0000');
  });

  it('should mark style variable as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        const bgColor = "#FF0000";
        return <div style={{ backgroundColor: bgColor }}>Box</div>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestBox', 'visual');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('variable-reference');
  });

  it('should mark external style object as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={boxStyles}>Box</div>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestBox', 'style');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('external-style');
  });

  it('should mark spread in style object as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ ...baseStyles, backgroundColor: "#FF0000" }}>Box</div>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const nodeReport = report.reports.find((r) => r.nodeName === 'TestBox');

    const spreadValue = nodeReport?.notWritable.find((v) => v.path === 'style.spread');
    expect(spreadValue).toBeDefined();
    expect(spreadValue?.reason).toBe('spread');
  });

  it('should mark flex style literals as auto-writable', () => {
    const code = wrapWithMarker(
      'TestContainer',
      `function TestContainer() {
        return <div style={{ display: "flex", flexDirection: "column" }}>Content</div>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestContainer', 'flex');

    expect(values.auto.length).toBe(2);
    expect(values.auto.find((v) => v.path === 'flex.display')?.value).toBe('flex');
    expect(values.auto.find((v) => v.path === 'flex.flexDirection')?.value).toBe('column');
  });
});

// =============================================================================
// TEXT NODES VS COMPUTED CHILDREN
// =============================================================================

describe('Write Feasibility - Text Nodes vs Computed Children', () => {
  it('should mark JSX text as auto-writable', () => {
    const code = wrapWithMarker(
      'TestHeading',
      `function TestHeading() {
        return <h1>Welcome to the App</h1>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestHeading', 'text.content');

    expect(values.auto.length).toBe(1);
    expect(values.auto[0].value).toBe('Welcome to the App');
  });

  it('should mark variable interpolation as not-writable', () => {
    const code = wrapWithMarker(
      'TestHeading',
      `function TestHeading({ name }: { name: string }) {
        return <h1>{name}</h1>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestHeading', 'text.content');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('variable-reference');
  });

  it('should mark function call in text as not-writable', () => {
    const code = wrapWithMarker(
      'TestLabel',
      `function TestLabel() {
        return <span>{formatLabel()}</span>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestLabel', 'text.content');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('function-call');
  });

  it('should mark template literal with expressions as conditionally-writable', () => {
    const code = wrapWithMarker(
      'TestLabel',
      `function TestLabel({ count }: { count: number }) {
        return <span>{\`Items: \${count}\`}</span>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestLabel', 'text.content');

    expect(values.conditional.length).toBe(1);
    expect(values.conditional[0].reason).toBe('simple-expression');
  });

  it('should mark static template literal as auto-writable', () => {
    const code = wrapWithMarker(
      'TestLabel',
      `function TestLabel() {
        return <span>{\`Hello World\`}</span>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestLabel', 'text.content');

    expect(values.auto.length).toBe(1);
    expect(values.auto[0].value).toBe('Hello World');
  });
});

// =============================================================================
// CLASSNAME HANDLING
// =============================================================================

describe('Write Feasibility - className Handling', () => {
  it('should mark className as not-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton() {
        return <button className="btn-primary">Click</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const nodeReport = report.reports.find((r) => r.nodeName === 'TestButton');

    const classValue = nodeReport?.notWritable.find((v) => v.path === 'props.className');
    expect(classValue).toBeDefined();
    expect(classValue?.reason).toBe('className');
    expect(classValue?.explanation).toContain('CSS modification');
  });

  it('should mark class as not-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton() {
        return <button class="btn-primary">Click</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const nodeReport = report.reports.find((r) => r.nodeName === 'TestButton');

    const classValue = nodeReport?.notWritable.find((v) => v.path === 'props.class');
    expect(classValue).toBeDefined();
    expect(classValue?.reason).toBe('className');
  });
});

// =============================================================================
// BOOLEAN PROPS
// =============================================================================

describe('Write Feasibility - Boolean Props', () => {
  it('should mark boolean literal as auto-writable', () => {
    const code = wrapWithMarker(
      'TestInput',
      `function TestInput() {
        return <input disabled={true} />;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestInput', 'booleans');

    expect(values.auto.length).toBe(1);
    expect(values.auto[0].path).toBe('booleans.disabled');
    expect(values.auto[0].value).toBe(true);
  });

  it('should mark implicit boolean (no value) as auto-writable', () => {
    const code = wrapWithMarker(
      'TestInput',
      `function TestInput() {
        return <input disabled />;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestInput', 'booleans');

    expect(values.auto.length).toBe(1);
    expect(values.auto[0].path).toBe('booleans.disabled');
    expect(values.auto[0].value).toBe(true);
  });

  it('should mark boolean variable as not-writable', () => {
    const code = wrapWithMarker(
      'TestInput',
      `function TestInput({ isDisabled }: { isDisabled: boolean }) {
        return <input disabled={isDisabled} />;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestInput', 'booleans');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('variable-reference');
  });
});

// =============================================================================
// EXPRESSION TYPES
// =============================================================================

describe('Write Feasibility - Expression Types', () => {
  it('should mark ternary with literals as conditionally-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton({ active }: { active: boolean }) {
        return <button style={{ backgroundColor: active ? "#00FF00" : "#FF0000" }}>Click</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestButton', 'visual');

    expect(values.conditional.length).toBe(1);
    expect(values.conditional[0].reason).toBe('simple-expression');
  });

  it('should mark ternary with variables as not-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton({ active, activeColor, inactiveColor }: any) {
        return <button style={{ backgroundColor: active ? activeColor : inactiveColor }}>Click</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestButton', 'visual');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('complex-expression');
  });

  it('should mark logical expression as conditionally-writable', () => {
    const code = wrapWithMarker(
      'TestButton',
      `function TestButton({ override }: { override?: string }) {
        return <button title={override || "Default"}>Click</button>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestButton', 'text.title');

    expect(values.conditional.length).toBe(1);
    expect(values.conditional[0].reason).toBe('simple-expression');
  });

  it('should mark binary arithmetic as not-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ width: 100 + 50 }}>Box</div>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestBox', 'layout');

    expect(values.notWritable.length).toBe(1);
    expect(values.notWritable[0].reason).toBe('computed');
  });

  it('should mark negative number as auto-writable', () => {
    const code = wrapWithMarker(
      'TestBox',
      `function TestBox() {
        return <div style={{ margin: -10 }}>Box</div>;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');
    const values = findValuesByPath(report, 'TestBox', 'layout');

    expect(values.auto.length).toBe(1);
    expect(values.auto[0].path).toBe('layout.margin');
    expect(values.auto[0].value).toBe(-10);
  });
});

// =============================================================================
// SUMMARY STATISTICS
// =============================================================================

describe('Write Feasibility - Summary Statistics', () => {
  it('should compute correct summary statistics', () => {
    const code = wrapWithMarker(
      'TestComponent',
      `function TestComponent({ dynamic }: { dynamic: string }) {
        return (
          <div style={{ width: 100, backgroundColor: bgColor }}>
            <h1>Static Title</h1>
            <span>{dynamic}</span>
          </div>
        );
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');

    expect(report.summary.totalNodes).toBe(1);
    expect(report.summary.totalValues).toBeGreaterThan(0);
    expect(report.summary.autoWritableCount).toBeGreaterThan(0);
    expect(report.summary.notWritableCount).toBeGreaterThan(0);
  });

  it('should handle empty component', () => {
    const code = wrapWithMarker(
      'EmptyComponent',
      `function EmptyComponent() {
        return null;
      }`
    );

    const report = analyzeWriteFeasibility(code, 'test.tsx');

    expect(report.summary.totalNodes).toBe(1);
    expect(report.summary.totalValues).toBe(0);
  });

  it('should handle component with no marker match', () => {
    const code = `
export function OrphanComponent() {
  return <div>No marker</div>;
}
`;

    const report = analyzeWriteFeasibility(code, 'test.tsx');

    expect(report.summary.totalNodes).toBe(0);
    expect(report.reports.length).toBe(0);
  });
});
