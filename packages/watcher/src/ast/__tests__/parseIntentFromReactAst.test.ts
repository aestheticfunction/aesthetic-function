/**
 * @aesthetic-function/watcher - ast/__tests__/parseIntentFromReactAst.test.ts
 *
 * Tests for the AST-based React analyzer.
 *
 * Includes:
 * - Snapshot test against demo-app/src/App.tsx
 * - Unit tests for component extraction
 * - Unit tests for literal extraction
 * - Unit tests for marker anchoring
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseIntentFromReactAst,
  anchorMarkersToAst,
} from '../parseIntentFromReactAst.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// FIXTURE HELPERS
// =============================================================================

/**
 * Read the demo App.tsx file.
 */
function readDemoApp(): string {
  const appPath = join(__dirname, '..', '..', '..', '..', '..', 'demo-app', 'src', 'App.tsx');
  return readFileSync(appPath, 'utf-8');
}

// =============================================================================
// SNAPSHOT TEST
// =============================================================================

describe('parseIntentFromReactAst - Snapshot', () => {
  it('should produce stable output for demo-app/src/App.tsx', () => {
    const code = readDemoApp();
    const report = parseIntentFromReactAst(code, 'demo-app/src/App.tsx');

    // Verify structure
    expect(report.filePath).toBe('demo-app/src/App.tsx');
    expect(report.components).toBeDefined();
    expect(Array.isArray(report.components)).toBe(true);

    // Snapshot the full report for stability
    expect(report).toMatchSnapshot();
  });

  it('should produce stable anchored report for demo-app/src/App.tsx', () => {
    const code = readDemoApp();
    const anchoredReport = anchorMarkersToAst(code, 'demo-app/src/App.tsx');

    // Verify structure
    expect(anchoredReport.filePath).toBe('demo-app/src/App.tsx');
    expect(anchoredReport.anchors).toBeDefined();
    expect(Array.isArray(anchoredReport.anchors)).toBe(true);

    // Snapshot the anchored report
    expect(anchoredReport).toMatchSnapshot();
  });
});

// =============================================================================
// COMPONENT EXTRACTION TESTS
// =============================================================================

describe('parseIntentFromReactAst - Component Extraction', () => {
  it('should extract function declaration components', () => {
    const code = `
      export function MyButton() {
        return <button>Click me</button>;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    expect(report.components).toHaveLength(1);
    expect(report.components[0].componentName).toBe('MyButton');
    expect(report.components[0].isExported).toBe(true);
  });

  it('should extract arrow function components', () => {
    const code = `
      export const MyButton = () => {
        return <button>Click me</button>;
      };
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    expect(report.components).toHaveLength(1);
    expect(report.components[0].componentName).toBe('MyButton');
    expect(report.components[0].isExported).toBe(true);
  });

  it('should detect non-exported components', () => {
    const code = `
      function InternalButton() {
        return <button>Internal</button>;
      }
      
      export function PublicButton() {
        return <InternalButton />;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    expect(report.components).toHaveLength(2);
    
    const internal = report.components.find((c) => c.componentName === 'InternalButton');
    const publicComp = report.components.find((c) => c.componentName === 'PublicButton');
    
    expect(internal?.isExported).toBe(false);
    expect(publicComp?.isExported).toBe(true);
  });

  it('should include location information', () => {
    const code = `export function MyButton() {
  return <button>Click</button>;
}`;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    expect(report.components[0].loc.startLine).toBe(1);
    expect(report.components[0].loc.endLine).toBe(3);
  });

  it('should ignore non-component functions (lowercase names)', () => {
    const code = `
      function helperFunction() {
        return 'hello';
      }
      
      export function Button() {
        return <button>{helperFunction()}</button>;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    // Only Button should be extracted (helperFunction starts lowercase)
    expect(report.components).toHaveLength(1);
    expect(report.components[0].componentName).toBe('Button');
  });
});

// =============================================================================
// JSX TEXT LITERAL TESTS
// =============================================================================

describe('parseIntentFromReactAst - JSX Text Literals', () => {
  it('should extract text from JSX children', () => {
    const code = `
      export function Greeting() {
        return <h1>Hello World</h1>;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    expect(report.components[0].jsxTextLiterals).toHaveLength(1);
    expect(report.components[0].jsxTextLiterals[0].text).toBe('Hello World');
  });

  it('should extract multiple text literals', () => {
    const code = `
      export function MultiText() {
        return (
          <div>
            <h1>Title</h1>
            <p>Description here</p>
          </div>
        );
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    const texts = report.components[0].jsxTextLiterals.map((t) => t.text);
    expect(texts).toContain('Title');
    expect(texts).toContain('Description here');
  });

  it('should trim whitespace from text', () => {
    const code = `
      export function Spaced() {
        return <p>
          Some text with spaces
        </p>;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    // Should have trimmed text
    const nonEmptyTexts = report.components[0].jsxTextLiterals.filter((t) => t.text.length > 0);
    expect(nonEmptyTexts.length).toBeGreaterThan(0);
    expect(nonEmptyTexts[0].text).toBe('Some text with spaces');
  });

  it('should ignore empty/whitespace-only text', () => {
    const code = `
      export function Empty() {
        return <div>   </div>;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    // Empty text should be filtered out
    expect(report.components[0].jsxTextLiterals).toHaveLength(0);
  });
});

// =============================================================================
// JSX PROP LITERAL TESTS
// =============================================================================

describe('parseIntentFromReactAst - JSX Prop Literals', () => {
  it('should extract string prop literals', () => {
    const code = `
      export function Button() {
        return <button aria-label="Submit form">Submit</button>;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    const props = report.components[0].jsxPropLiterals;
    const ariaLabel = props.find((p) => p.prop === 'aria-label');
    
    expect(ariaLabel).toBeDefined();
    expect(ariaLabel?.value).toBe('Submit form');
    expect(ariaLabel?.element).toBe('button');
  });

  it('should extract boolean prop literals', () => {
    const code = `
      export function DisabledButton() {
        return <button disabled={true}>Disabled</button>;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    const props = report.components[0].jsxPropLiterals;
    const disabled = props.find((p) => p.prop === 'disabled');
    
    expect(disabled).toBeDefined();
    expect(disabled?.value).toBe(true);
  });

  it('should extract numeric prop literals', () => {
    const code = `
      export function SizedComponent() {
        return <div tabIndex={0} />;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    const props = report.components[0].jsxPropLiterals;
    const tabIndex = props.find((p) => p.prop === 'tabIndex');
    
    expect(tabIndex).toBeDefined();
    expect(tabIndex?.value).toBe(0);
  });

  it('should ignore non-literal props (variables, expressions)', () => {
    const code = `
      export function DynamicButton({ label }) {
        const id = "btn-1";
        return <button id={id} aria-label={label}>Click</button>;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    // Neither id nor aria-label should be extracted (they reference variables)
    const props = report.components[0].jsxPropLiterals;
    expect(props.find((p) => p.prop === 'id')).toBeUndefined();
    expect(props.find((p) => p.prop === 'aria-label')).toBeUndefined();
  });
});

// =============================================================================
// INLINE STYLE LITERAL TESTS
// =============================================================================

describe('parseIntentFromReactAst - Inline Style Literals', () => {
  it('should extract string style literals', () => {
    const code = `
      export function ColorBox() {
        return <div style={{ backgroundColor: "#FF0000" }} />;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    const styles = report.components[0].inlineStyleLiterals;
    const bg = styles.find((s) => s.styleProp === 'backgroundColor');
    
    expect(bg).toBeDefined();
    expect(bg?.value).toBe('#FF0000');
  });

  it('should extract numeric style literals', () => {
    const code = `
      export function RoundedBox() {
        return <div style={{ borderRadius: 8, padding: 16 }} />;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    const styles = report.components[0].inlineStyleLiterals;
    const radius = styles.find((s) => s.styleProp === 'borderRadius');
    const padding = styles.find((s) => s.styleProp === 'padding');
    
    expect(radius?.value).toBe(8);
    expect(padding?.value).toBe(16);
  });

  it('should extract multiple style properties', () => {
    const code = `
      export function StyledButton() {
        return (
          <button
            style={{
              backgroundColor: '#3B82F6',
              color: 'white',
              padding: 12,
              borderRadius: 4,
            }}
          >
            Click
          </button>
        );
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    const styles = report.components[0].inlineStyleLiterals;
    expect(styles.length).toBeGreaterThanOrEqual(4);
    
    expect(styles.find((s) => s.styleProp === 'backgroundColor')?.value).toBe('#3B82F6');
    expect(styles.find((s) => s.styleProp === 'color')?.value).toBe('white');
    expect(styles.find((s) => s.styleProp === 'padding')?.value).toBe(12);
    expect(styles.find((s) => s.styleProp === 'borderRadius')?.value).toBe(4);
  });

  it('should ignore variable references in styles', () => {
    const code = `
      const primaryColor = '#3B82F6';
      
      export function DynamicStyle() {
        return <div style={{ backgroundColor: primaryColor }} />;
      }
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    // backgroundColor references a variable, should not be extracted
    const styles = report.components[0].inlineStyleLiterals;
    expect(styles.find((s) => s.styleProp === 'backgroundColor')).toBeUndefined();
  });
});

// =============================================================================
// MARKER ANCHORING TESTS
// =============================================================================

describe('anchorMarkersToAst - Marker Anchoring', () => {
  it('should anchor marker to the next exported component', () => {
    const code = `
// @figma node=LoginButton text="Login" fill=#3B82F6
export function LoginButton() {
  return <button>Sign In</button>;
}
    `;
    const anchored = anchorMarkersToAst(code, 'test.tsx');

    expect(anchored.anchors).toHaveLength(1);
    expect(anchored.anchors[0].nodeName).toBe('LoginButton');
    expect(anchored.anchors[0].componentName).toBe('LoginButton');
    expect(anchored.anchors[0].markerLine).toBe(2);
  });

  it('should skip non-exported components when anchoring', () => {
    const code = `
// @figma node=PublicButton fill=#FF0000
function InternalHelper() {
  return <span>helper</span>;
}

export function PublicButton() {
  return <button style={{ backgroundColor: "#FF0000" }}>Click</button>;
}
    `;
    const anchored = anchorMarkersToAst(code, 'test.tsx');

    expect(anchored.anchors).toHaveLength(1);
    // Should skip InternalHelper and anchor to PublicButton
    expect(anchored.anchors[0].componentName).toBe('PublicButton');
  });

  it('should report when no component is found after marker', () => {
    const code = `
export function FirstComponent() {
  return <div>First</div>;
}

// @figma node=Orphan text="No component here"
    `;
    const anchored = anchorMarkersToAst(code, 'test.tsx');

    expect(anchored.anchors).toHaveLength(1);
    expect(anchored.anchors[0].componentName).toBeUndefined();
    expect(anchored.anchors[0].notes).toContain('no component found after marker');
  });

  it('should extract text from anchored component', () => {
    const code = `
// @figma node=Greeting text="Hello"
export function Greeting() {
  return <h1>Welcome to our app</h1>;
}
    `;
    const anchored = anchorMarkersToAst(code, 'test.tsx');

    expect(anchored.anchors[0].extracted.text).toBeDefined();
    expect(anchored.anchors[0].extracted.text).toContain('Welcome to our app');
  });

  it('should extract fills (hex backgroundColor) from anchored component', () => {
    const code = `
// @figma node=ColorBox fill=#FF0000
export function ColorBox() {
  return <div style={{ backgroundColor: "#3B82F6" }} />;
}
    `;
    const anchored = anchorMarkersToAst(code, 'test.tsx');

    expect(anchored.anchors[0].extracted.fills).toBeDefined();
    expect(anchored.anchors[0].extracted.fills).toContain('#3B82F6');
  });

  it('should only include hex colors in fills', () => {
    const code = `
// @figma node=MixedBox fill=#FF0000
export function MixedBox() {
  return (
    <div style={{ 
      backgroundColor: "#3B82F6",
      color: "white",
      borderColor: "rgb(0,0,0)",
    }} />
  );
}
    `;
    const anchored = anchorMarkersToAst(code, 'test.tsx');

    // Only hex colors should be in fills
    const fills = anchored.anchors[0].extracted.fills ?? [];
    expect(fills).toContain('#3B82F6');
    expect(fills).not.toContain('white');
    expect(fills).not.toContain('rgb(0,0,0)');
  });

  it('should handle multiple markers in a file', () => {
    const code = `
// @figma node=Header text="Welcome"
export function Header() {
  return <h1>Hello</h1>;
}

// @figma node=Button fill=#FF0000
export function Button() {
  return <button style={{ backgroundColor: "#FF0000" }}>Click</button>;
}
    `;
    const anchored = anchorMarkersToAst(code, 'test.tsx');

    expect(anchored.anchors).toHaveLength(2);
    expect(anchored.anchors[0].nodeName).toBe('Header');
    expect(anchored.anchors[0].componentName).toBe('Header');
    expect(anchored.anchors[1].nodeName).toBe('Button');
    expect(anchored.anchors[1].componentName).toBe('Button');
  });

  it('should handle demo-app/src/App.tsx markers correctly', () => {
    const code = readDemoApp();
    const anchored = anchorMarkersToAst(code, 'demo-app/src/App.tsx');

    // Should have 3 markers: LoginButton, TestBox, WelcomeText
    const loginButton = anchored.anchors.find((a) => a.nodeName === 'LoginButton');
    const testBox = anchored.anchors.find((a) => a.nodeName === 'TestBox');
    const welcomeText = anchored.anchors.find((a) => a.nodeName === 'WelcomeText');

    expect(loginButton).toBeDefined();
    expect(loginButton?.componentName).toBe('LoginButton');
    expect(loginButton?.extracted.fills).toContain('#3B82F6');
    expect(loginButton?.extracted.text).toContain('Sign In');

    expect(testBox).toBeDefined();
    expect(testBox?.componentName).toBe('TestBox');
    expect(testBox?.extracted.fills).toContain('#FF0000');

    expect(welcomeText).toBeDefined();
    expect(welcomeText?.componentName).toBe('WelcomeHeading');
    expect(welcomeText?.extracted.text).toContain('Welcome to the Demo');
  });
});
