/**
 * @aesthetic-function/watcher - parse/__tests__/parseIntentFromReact.test.ts
 *
 * Unit tests for the marker parser.
 *
 * Focus areas:
 * - Ignoring block-comment examples (docstrings)
 * - Ignoring placeholder node names (<FigmaNodeName>)
 * - Correctly matching real markers
 */

import { describe, it, expect } from 'vitest';
import {
  parseIntentFromReact,
  extractMarkers,
  isPlaceholderNode,
  hasFigmaMarkers,
} from '../parseIntentFromReact.js';

// =============================================================================
// PLACEHOLDER NODE DETECTION
// =============================================================================

describe('isPlaceholderNode', () => {
  it('should detect placeholder nodes wrapped in angle brackets', () => {
    expect(isPlaceholderNode('<FigmaNodeName>')).toBe(true);
    expect(isPlaceholderNode('<NodeName>')).toBe(true);
    expect(isPlaceholderNode('<Text>')).toBe(true);
    expect(isPlaceholderNode('<TokenOrHex>')).toBe(true);
  });

  it('should NOT detect real node names as placeholders', () => {
    expect(isPlaceholderNode('LoginButton')).toBe(false);
    expect(isPlaceholderNode('TestBox')).toBe(false);
    expect(isPlaceholderNode('WelcomeText')).toBe(false);
    expect(isPlaceholderNode('Card')).toBe(false);
  });

  it('should NOT detect partial angle brackets as placeholders', () => {
    expect(isPlaceholderNode('<Partial')).toBe(false);
    expect(isPlaceholderNode('Partial>')).toBe(false);
    expect(isPlaceholderNode('No<Brackets>Here')).toBe(false);
  });
});

// =============================================================================
// BLOCK COMMENT / DOCSTRING EXAMPLES
// =============================================================================

describe('extractMarkers - block comment examples', () => {
  it('should ignore @figma markers inside block comments (docstrings)', () => {
    const content = `
/**
 * MARKER FORMAT:
 *   // @figma node=<FigmaNodeName> text="<Text>" fill=<TokenOrHex>
 */
function App() {}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(0);
  });

  it('should ignore @figma markers with asterisk prefix', () => {
    const content = `
/*
 * Example usage:
 * // @figma node=ExampleNode text="Example"
 */
function App() {}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(0);
  });

  it('should ignore @figma markers inside JSDoc blocks', () => {
    const content = `
/**
 * Demo React Component with @figma markers
 *
 * This file demonstrates the @figma marker syntax for syncing
 * React components to Figma.
 *
 * MARKER FORMAT:
 *   // @figma node=<FigmaNodeName> text="<Text>" fill=<TokenOrHex>
 *
 * INSTRUCTIONS:
 * 1. Run the server: pnpm dev:server
 * 2. Run the watcher: pnpm dev:watcher
 */
function App() {}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(0);
  });
});

// =============================================================================
// PLACEHOLDER NODE NAMES
// =============================================================================

describe('extractMarkers - placeholder node names', () => {
  it('should ignore markers with placeholder node names', () => {
    const content = `
// @figma node=<FigmaNodeName> text="<Text>" fill=<TokenOrHex>
function App() {}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(0);
  });

  it('should ignore markers with various placeholder patterns', () => {
    const content = `
// @figma node=<NodeName> text="Hello"
// @figma node=<Example> fill=#FF0000
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(0);
  });
});

// =============================================================================
// REAL MARKERS
// =============================================================================

describe('extractMarkers - real markers', () => {
  it('should match a real marker with text and fill', () => {
    const content = `
// @figma node=LoginButton text="Sign In" fill=Primary/Blue500
function LoginButton() {}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(1);
    expect(markers[0].node).toBe('LoginButton');
    expect(markers[0].text).toBe('Sign In');
    expect(markers[0].fill).toBe('Primary/Blue500');
  });

  it('should match a real marker with only fill', () => {
    const content = `
// @figma node=TestBox fill=#FF0000
function TestBox() {}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(1);
    expect(markers[0].node).toBe('TestBox');
    expect(markers[0].fill).toBe('#FF0000');
    expect(markers[0].text).toBeUndefined();
  });

  it('should match a real marker with only text', () => {
    const content = `
// @figma node=WelcomeText text="Welcome to the Demo"
function WelcomeHeading() {}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(1);
    expect(markers[0].node).toBe('WelcomeText');
    expect(markers[0].text).toBe('Welcome to the Demo');
    expect(markers[0].fill).toBeUndefined();
  });

  it('should match multiple real markers', () => {
    const content = `
// @figma node=LoginButton text="Sign In" fill=#3B82F6
function LoginButton() {}

// @figma node=TestBox fill=#FF0000
function TestBox() {}

// @figma node=WelcomeText text="Welcome"
function WelcomeHeading() {}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(3);
    expect(markers[0].node).toBe('LoginButton');
    expect(markers[1].node).toBe('TestBox');
    expect(markers[2].node).toBe('WelcomeText');
  });

  it('should match markers with leading whitespace', () => {
    const content = `
function App() {
    // @figma node=IndentedButton text="Click Me" fill=#FF0000
    return <button>Click Me</button>;
}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(1);
    expect(markers[0].node).toBe('IndentedButton');
  });
});

// =============================================================================
// MIXED CONTENT (DOCS + REAL MARKERS)
// =============================================================================

describe('extractMarkers - mixed content', () => {
  it('should match real markers and ignore docstring examples', () => {
    const content = `
/**
 * Demo React Component with @figma markers
 *
 * MARKER FORMAT:
 *   // @figma node=<FigmaNodeName> text="<Text>" fill=<TokenOrHex>
 */

// @figma node=LoginButton text="Sign In" fill=#ff0000
export function LoginButton() {
  return <button>Sign In</button>;
}

// @figma node=TestBox fill=#FF0000
export function TestBox() {
  return <div />;
}
`;
    const markers = extractMarkers(content);
    expect(markers).toHaveLength(2);
    expect(markers[0].node).toBe('LoginButton');
    expect(markers[1].node).toBe('TestBox');
  });
});

// =============================================================================
// FULL PARSER (parseIntentFromReact)
// =============================================================================

describe('parseIntentFromReact', () => {
  it('should produce correct intents from real markers', () => {
    const content = `
// @figma node=LoginButton text="Sign In" fill=#3B82F6
function LoginButton() {}
`;
    const result = parseIntentFromReact(content, 'test.tsx');
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].type).toBe('BUTTON');
    expect(result.intents[0].nodeName).toBe('LoginButton');
  });

  it('should ignore docstring examples in full parse', () => {
    const content = `
/**
 * MARKER FORMAT:
 *   // @figma node=<FigmaNodeName> text="<Text>" fill=<TokenOrHex>
 */
function App() {}
`;
    const result = parseIntentFromReact(content, 'test.tsx');
    expect(result.intents).toHaveLength(0);
    expect(result.markerCount).toBe(0);
  });

  it('should report correct marker count', () => {
    const content = `
// @figma node=A text="A" fill=#FF0000
// @figma node=B text="B"
// @figma node=C fill=#00FF00
`;
    const result = parseIntentFromReact(content, 'test.tsx');
    expect(result.markerCount).toBe(3);
    expect(result.intents).toHaveLength(3);
  });
});

// =============================================================================
// hasFigmaMarkers
// =============================================================================

describe('hasFigmaMarkers', () => {
  it('should return true if file contains @figma', () => {
    expect(hasFigmaMarkers('// @figma node=Test')).toBe(true);
    expect(hasFigmaMarkers('some text @figma more text')).toBe(true);
  });

  it('should return false if file does not contain @figma', () => {
    expect(hasFigmaMarkers('function App() {}')).toBe(false);
    expect(hasFigmaMarkers('// regular comment')).toBe(false);
  });
});

// =============================================================================
// STATE PARSING (Phase 8A)
// =============================================================================

describe('State parsing (Phase 8A)', () => {
  it('should parse state=hover from marker', () => {
    const content = `// @figma node=LoginButton state=hover fill=#FF0000`;
    const result = parseIntentFromReact(content, 'test.tsx');
    
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].state).toBe('hover');
    expect(result.intents[0].nodeName).toBe('LoginButton');
  });

  it('should parse state=disabled from marker', () => {
    const content = `// @figma node=SubmitButton state=disabled fill=#CCCCCC text="Disabled"`;
    const result = parseIntentFromReact(content, 'test.tsx');
    
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].state).toBe('disabled');
    expect(result.intents[0].nodeName).toBe('SubmitButton');
  });

  it('should parse state=pressed from marker', () => {
    const content = `// @figma node=ActionButton state=pressed fill=#000000`;
    const result = parseIntentFromReact(content, 'test.tsx');
    
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].state).toBe('pressed');
  });

  it('should default to undefined state (base) when not specified', () => {
    const content = `// @figma node=NormalButton fill=#3B82F6`;
    const result = parseIntentFromReact(content, 'test.tsx');
    
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].state).toBeUndefined();
  });

  it('should ignore invalid state values', () => {
    const content = `// @figma node=Button state=invalid fill=#FF0000`;
    const result = parseIntentFromReact(content, 'test.tsx');
    
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].state).toBeUndefined();
  });

  it('should parse multiple markers with different states', () => {
    const content = `
// @figma node=Button fill=#3B82F6 text="Click me"
// @figma node=Button state=hover fill=#2563EB text="Click me"
// @figma node=Button state=disabled fill=#9CA3AF text="Click me"
`;
    const result = parseIntentFromReact(content, 'test.tsx');
    
    expect(result.intents).toHaveLength(3);
    expect(result.intents[0].state).toBeUndefined(); // base
    expect(result.intents[1].state).toBe('hover');
    expect(result.intents[2].state).toBe('disabled');
  });
});
