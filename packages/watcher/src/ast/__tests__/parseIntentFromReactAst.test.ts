/**
 * @aesthetic-function/watcher - ast/__tests__/parseIntentFromReactAst.test.ts
 *
 * Tests for the AST-based React analyzer.
 *
 * IMPORTANT: Snapshot tests use fixtures from __fixtures__/, NOT demo-app/.
 * This ensures:
 * - Snapshots are deterministic and stable
 * - Human edits to demo-app don't break tests
 * - Each fixture is version-controlled with its expected output
 *
 * Includes:
 * - Snapshot test against App.fixture.tsx
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
 * Normalized fixture path for snapshots.
 * Using a constant path ensures snapshots are identical across machines.
 */
const FIXTURE_PATH = 'fixtures/App.fixture.tsx';

/**
 * Read the App fixture file for snapshot tests.
 *
 * ⚠️ Uses __fixtures__/App.fixture.tsx, NOT demo-app/src/App.tsx.
 * This decouples tests from human-editable demo content.
 */
function readAppFixture(): string {
  const fixturePath = join(__dirname, '..', '..', '__fixtures__', 'App.fixture.tsx');
  return readFileSync(fixturePath, 'utf-8');
}

// =============================================================================
// SNAPSHOT TEST
// =============================================================================

describe('parseIntentFromReactAst - Snapshot', () => {
  /**
   * ⚠️ This test uses App.fixture.tsx, NOT demo-app/src/App.tsx.
   * Editing demo-app content will NOT affect this snapshot.
   */
  it('should produce stable output for App.fixture.tsx', () => {
    const code = readAppFixture();
    const report = parseIntentFromReactAst(code, FIXTURE_PATH);

    // Verify structure
    expect(report.filePath).toBe(FIXTURE_PATH);
    expect(report.components).toBeDefined();
    expect(Array.isArray(report.components)).toBe(true);

    // Snapshot the full report for stability
    expect(report).toMatchSnapshot();
  });

  /**
   * ⚠️ This test uses App.fixture.tsx, NOT demo-app/src/App.tsx.
   * Editing demo-app content will NOT affect this snapshot.
   */
  it('should produce stable anchored report for App.fixture.tsx', () => {
    const code = readAppFixture();
    const anchoredReport = anchorMarkersToAst(code, FIXTURE_PATH);

    // Verify structure
    expect(anchoredReport.filePath).toBe(FIXTURE_PATH);
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
// WRAPPED COMPONENT EXTRACTION TESTS (forwardRef / memo)
// =============================================================================

describe('parseIntentFromReactAst - Wrapped Component Extraction', () => {
  it('should extract a React.forwardRef-wrapped component', () => {
    // Dominant shadcn/ui shape. loc spans the whole VariableDeclaration.
    const code = `import * as React from 'react';
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return <button ref={ref} {...props}>Click me</button>;
});`;
    const report = parseIntentFromReactAst(code, 'Button.tsx');

    expect(report.components).toHaveLength(1);
    const button = report.components[0];
    expect(button.componentName).toBe('Button');
    expect(button.isExported).toBe(true);
    expect(button.componentKey).toBe('Button');
    expect(button.loc.startLine).toBe(2);
    expect(button.loc.endLine).toBe(4);
    // JSX inside the wrapped render fn is still analyzed
    expect(button.jsxTextLiterals.map((t) => t.text)).toContain('Click me');
  });

  it('should extract a bare forwardRef-wrapped component', () => {
    const code = `
      import { forwardRef } from 'react';
      export const Input = forwardRef((props, ref) => {
        return <input ref={ref} />;
      });
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    expect(report.components).toHaveLength(1);
    expect(report.components[0].componentName).toBe('Input');
    expect(report.components[0].isExported).toBe(true);
  });

  it('should extract a memo-wrapped component', () => {
    const code = `
      import { memo } from 'react';
      export const Card = memo(() => {
        return <div>Card body</div>;
      });
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    expect(report.components).toHaveLength(1);
    expect(report.components[0].componentName).toBe('Card');
    expect(report.components[0].isExported).toBe(true);
  });

  it('should not treat unrelated call-expression initializers as components', () => {
    const code = `
      export const Config = createConfig(() => {
        return <div>not a component</div>;
      });
    `;
    const report = parseIntentFromReactAst(code, 'test.tsx');

    // createConfig is not forwardRef/memo, so Config is not a component shape
    expect(report.components).toHaveLength(0);
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

  /**
   * ⚠️ This test uses App.fixture.tsx, NOT demo-app/src/App.tsx.
   * Editing demo-app content will NOT affect this test.
   */
  it('should handle App.fixture.tsx markers correctly', () => {
    const code = readAppFixture();
    const anchored = anchorMarkersToAst(code, FIXTURE_PATH);

    // Should have 4 markers: LoginButton, LoginButton::hover, TestBox, WelcomeText
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

// =============================================================================
// PHASE 6B: SEMANTIC INTENT TESTS
// =============================================================================

describe('parseIntentFromReactAst - Semantic Intent (Phase 6B)', () => {
  describe('Text Semantics', () => {
    it('should extract placeholder attribute', () => {
      const code = `
        export function SearchInput() {
          return <input placeholder="Search..." />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      const semantics = report.components[0].semantics;
      expect(semantics.text.placeholder).toBeDefined();
      expect(semantics.text.placeholder?.value).toBe('Search...');
      expect(semantics.text.placeholder?.confidence).toBe('high');
    });

    it('should extract title attribute', () => {
      const code = `
        export function InfoButton() {
          return <button title="Click for more info">?</button>;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.text.title?.value).toBe('Click for more info');
    });

    it('should extract aria-label attribute', () => {
      const code = `
        export function CloseButton() {
          return <button aria-label="Close dialog">×</button>;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.text.ariaLabel?.value).toBe('Close dialog');
    });

    it('should extract alt attribute', () => {
      const code = `
        export function Avatar() {
          return <img alt="User profile picture" src="user.jpg" />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.text.alt?.value).toBe('User profile picture');
    });

    it('should extract text content', () => {
      const code = `
        export function Heading() {
          return <h1>Welcome to the App</h1>;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      const content = report.components[0].semantics.text.content;
      expect(content).toBeDefined();
      expect(content?.length).toBe(1);
      expect(content?.[0].value).toBe('Welcome to the App');
    });
  });

  describe('Boolean Semantics', () => {
    it('should extract disabled prop as true', () => {
      const code = `
        export function DisabledButton() {
          return <button disabled={true}>Submit</button>;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.booleans.disabled?.value).toBe(true);
      expect(report.components[0].semantics.booleans.disabled?.confidence).toBe('high');
    });

    it('should extract disabled prop as false', () => {
      const code = `
        export function EnabledButton() {
          return <button disabled={false}>Submit</button>;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.booleans.disabled?.value).toBe(false);
    });

    it('should extract checked prop', () => {
      const code = `
        export function Checkbox() {
          return <input type="checkbox" checked={true} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.booleans.checked?.value).toBe(true);
    });

    it('should extract selected prop', () => {
      const code = `
        export function Option() {
          return <option selected={true}>Default</option>;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.booleans.selected?.value).toBe(true);
    });

    it('should skip boolean props with variable values', () => {
      const code = `
        export function DynamicButton({ isDisabled }) {
          return <button disabled={isDisabled}>Submit</button>;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      // Should not extract disabled since it's a variable
      expect(report.components[0].semantics.booleans.disabled).toBeUndefined();
    });
  });

  describe('Layout Semantics', () => {
    it('should extract width and height from props', () => {
      const code = `
        export function SizedBox() {
          return <div width={100} height={50} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.layout.width?.value).toBe(100);
      expect(report.components[0].semantics.layout.height?.value).toBe(50);
    });

    it('should extract width and height from style', () => {
      const code = `
        export function StyledBox() {
          return <div style={{ width: 200, height: 100 }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.layout.width?.value).toBe(200);
      expect(report.components[0].semantics.layout.height?.value).toBe(100);
    });

    it('should extract padding from style', () => {
      const code = `
        export function PaddedBox() {
          return <div style={{ padding: 16 }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.layout.padding?.value).toBe(16);
    });

    it('should extract margin from style', () => {
      const code = `
        export function MarginBox() {
          return <div style={{ margin: 8 }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.layout.margin?.value).toBe(8);
    });

    it('should extract gap from style', () => {
      const code = `
        export function GapContainer() {
          return <div style={{ gap: 12 }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.layout.gap?.value).toBe(12);
    });

    it('should skip layout props with variable values', () => {
      const code = `
        export function DynamicBox({ size }) {
          return <div style={{ width: size, height: size }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.layout.width).toBeUndefined();
      expect(report.components[0].semantics.layout.height).toBeUndefined();
    });
  });

  describe('Flex Semantics', () => {
    it('should extract display flex', () => {
      const code = `
        export function FlexContainer() {
          return <div style={{ display: 'flex' }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.flex.display?.value).toBe('flex');
    });

    it('should extract flexDirection', () => {
      const code = `
        export function ColumnLayout() {
          return <div style={{ display: 'flex', flexDirection: 'column' }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.flex.flexDirection?.value).toBe('column');
    });

    it('should extract justifyContent', () => {
      const code = `
        export function CenteredRow() {
          return <div style={{ display: 'flex', justifyContent: 'center' }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.flex.justifyContent?.value).toBe('center');
    });

    it('should extract alignItems', () => {
      const code = `
        export function AlignedRow() {
          return <div style={{ display: 'flex', alignItems: 'center' }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.flex.alignItems?.value).toBe('center');
    });

    it('should extract all flex properties together', () => {
      const code = `
        export function FullFlexContainer() {
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }} />
          );
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      const flex = report.components[0].semantics.flex;
      expect(flex.display?.value).toBe('flex');
      expect(flex.flexDirection?.value).toBe('row');
      expect(flex.justifyContent?.value).toBe('space-between');
      expect(flex.alignItems?.value).toBe('flex-start');
    });
  });

  describe('Visual Semantics', () => {
    it('should extract hex backgroundColor as fill', () => {
      const code = `
        export function ColorBox() {
          return <div style={{ backgroundColor: '#FF0000' }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.visual.fills).toBeDefined();
      expect(report.components[0].semantics.visual.fills?.length).toBe(1);
      expect(report.components[0].semantics.visual.fills?.[0].value).toBe('#FF0000');
    });

    it('should extract multiple fills from different elements', () => {
      const code = `
        export function MultiColorBox() {
          return (
            <div style={{ backgroundColor: '#FF0000' }}>
              <span style={{ backgroundColor: '#00FF00' }} />
            </div>
          );
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      expect(report.components[0].semantics.visual.fills?.length).toBe(2);
    });

    it('should not extract non-hex backgroundColor', () => {
      const code = `
        export function NamedColorBox() {
          return <div style={{ backgroundColor: 'red' }} />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      // 'red' is not a hex color, should not be in fills
      expect(report.components[0].semantics.visual.fills).toBeUndefined();
    });
  });

  describe('Mixed Literal/Expression Handling', () => {
    it('should extract only literal values, skip expressions', () => {
      const code = `
        export function MixedComponent({ dynamicWidth }) {
          const dynamicColor = '#dynamic';
          return (
            <button
              disabled={true}
              aria-label={getLabel()}
              style={{
                width: dynamicWidth,
                height: 50,
                backgroundColor: dynamicColor,
                padding: 16
              }}
            >
              Click
            </button>
          );
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      const sem = report.components[0].semantics;

      // Literal values should be extracted
      expect(sem.booleans.disabled?.value).toBe(true);
      expect(sem.layout.height?.value).toBe(50);
      expect(sem.layout.padding?.value).toBe(16);
      expect(sem.text.content?.[0].value).toBe('Click');

      // Non-literal values should NOT be extracted
      expect(sem.text.ariaLabel).toBeUndefined(); // getLabel() is a call
      expect(sem.layout.width).toBeUndefined(); // dynamicWidth is a variable
      // dynamicColor is a variable, so no fill
    });

    it('should handle components with no semantic content', () => {
      const code = `
        export function EmptyComponent() {
          return <div />;
        }
      `;
      const report = parseIntentFromReactAst(code, 'test.tsx');

      const sem = report.components[0].semantics;
      expect(sem.text.content).toBeUndefined();
      expect(sem.booleans.disabled).toBeUndefined();
      expect(sem.layout.width).toBeUndefined();
      expect(sem.flex.display).toBeUndefined();
      expect(sem.visual.fills).toBeUndefined();
    });
  });
});
