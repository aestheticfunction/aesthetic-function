/**
 * Regression tests for SET_FILL shape targeting.
 *
 * WHY: The previous generic resolver returned TEXT nodes for SET_FILL
 * because TEXT has a `fills` property (for text color). These tests
 * enforce the invariant: fill resolver NEVER returns TEXT, uses a strict
 * shape allowlist, and fails closed when no shape is found.
 */
import { describe, it, expect } from 'vitest';
import {
  findFillShapeInContainer,
  resolveFillTarget,
  FILL_SHAPE_TYPES,
  SELF_FILL_TYPES,
  MockNode,
} from '../resolvers.js';

// =============================================================================
// HELPERS
// =============================================================================

function node(type: string, name: string, children?: MockNode[]): MockNode {
  return { type, name, id: `${name}-id`, visible: true, children };
}

/** Base variant: COMPONENT with RECTANGLE + TEXT children */
function baseVariant(text = 'Login'): MockNode {
  return node('COMPONENT', 'State=Base', [
    node('RECTANGLE', 'Background'),
    node('TEXT', text),
  ]);
}

/** Hover variant: same structure */
function hoverVariant(text = 'Login'): MockNode {
  return node('COMPONENT', 'State=Hover', [
    node('RECTANGLE', 'Background'),
    node('TEXT', text),
  ]);
}

// =============================================================================
// SHAPE ALLOWLIST TESTS
// =============================================================================

describe('FILL_SHAPE_TYPES allowlist', () => {
  it('includes common visual shapes', () => {
    expect(FILL_SHAPE_TYPES.has('RECTANGLE')).toBe(true);
    expect(FILL_SHAPE_TYPES.has('ELLIPSE')).toBe(true);
    expect(FILL_SHAPE_TYPES.has('VECTOR')).toBe(true);
    expect(FILL_SHAPE_TYPES.has('LINE')).toBe(true);
    expect(FILL_SHAPE_TYPES.has('STAR')).toBe(true);
    expect(FILL_SHAPE_TYPES.has('POLYGON')).toBe(true);
    expect(FILL_SHAPE_TYPES.has('BOOLEAN_OPERATION')).toBe(true);
  });

  it('excludes TEXT — critical invariant', () => {
    expect(FILL_SHAPE_TYPES.has('TEXT')).toBe(false);
  });

  it('excludes container types', () => {
    expect(FILL_SHAPE_TYPES.has('COMPONENT')).toBe(false);
    expect(FILL_SHAPE_TYPES.has('COMPONENT_SET')).toBe(false);
    expect(FILL_SHAPE_TYPES.has('FRAME')).toBe(false);
  });
});

// =============================================================================
// FILL TARGETING: CORE INVARIANT — NEVER RETURNS TEXT
// =============================================================================

describe('findFillShapeInContainer — never returns TEXT', () => {
  it('returns null when only child is TEXT', () => {
    const container = node('COMPONENT', 'TextOnly', [
      node('TEXT', 'Label'),
    ]);
    expect(findFillShapeInContainer(container)).toBeNull();
  });

  it('returns RECTANGLE when TEXT and RECTANGLE are siblings', () => {
    const container = node('COMPONENT', 'Mixed', [
      node('TEXT', 'Label'),
      node('RECTANGLE', 'Background'),
    ]);
    const result = findFillShapeInContainer(container)!;
    expect(result.type).toBe('RECTANGLE');
    expect(result.name).toBe('Background');
  });

  it('returns RECTANGLE even when TEXT appears first', () => {
    const container = node('COMPONENT', 'TextFirst', [
      node('TEXT', 'Login'),
      node('TEXT', 'Subtitle'),
      node('RECTANGLE', 'Bg'),
    ]);
    const result = findFillShapeInContainer(container)!;
    expect(result.type).toBe('RECTANGLE');
  });

  it('ignores TEXT named "Background"', () => {
    const container = node('COMPONENT', 'Tricky', [
      node('TEXT', 'Background'),
      node('RECTANGLE', 'ActualBg'),
    ]);
    const result = findFillShapeInContainer(container)!;
    expect(result.type).toBe('RECTANGLE');
  });
});

// =============================================================================
// FILL TARGETING: RESOLUTION ORDER
// =============================================================================

describe('findFillShapeInContainer — resolution order', () => {
  it('prefers child named "background" (shape) over unnamed shape', () => {
    const container = node('COMPONENT', 'Button', [
      node('RECTANGLE', 'SomeRect'),
      node('RECTANGLE', 'Background'),
    ]);
    const result = findFillShapeInContainer(container)!;
    expect(result.name).toBe('Background');
  });

  it('prefers child named "fill" (shape)', () => {
    const container = node('COMPONENT', 'Card', [
      node('ELLIPSE', 'Fill'),
      node('RECTANGLE', 'Border'),
    ]);
    const result = findFillShapeInContainer(container)!;
    expect(result.name).toBe('Fill');
  });

  it('returns first shape when no named children', () => {
    const container = node('COMPONENT', 'Simple', [
      node('ELLIPSE', 'Circle'),
      node('RECTANGLE', 'Square'),
    ]);
    const result = findFillShapeInContainer(container)!;
    expect(result.name).toBe('Circle');
  });
});

// =============================================================================
// FILL TARGETING: RECURSIVE SEARCH
// =============================================================================

describe('findFillShapeInContainer — recursive', () => {
  it('finds RECTANGLE nested in FRAME (COMPONENT → FRAME → RECTANGLE)', () => {
    const container = node('COMPONENT', 'Nested', [
      node('FRAME', 'Layout', [
        node('RECTANGLE', 'DeepBg'),
        node('TEXT', 'Label'),
      ]),
    ]);
    const result = findFillShapeInContainer(container)!;
    expect(result.type).toBe('RECTANGLE');
    expect(result.name).toBe('DeepBg');
  });

  it('skips TEXT in recursive search', () => {
    const container = node('COMPONENT', 'OnlyText', [
      node('FRAME', 'Layout', [
        node('TEXT', 'Label'),
      ]),
    ]);
    expect(findFillShapeInContainer(container)).toBeNull();
  });

  it('stops at max depth (depth > 3)', () => {
    const container = node('FRAME', 'L0', [
      node('FRAME', 'L1', [
        node('FRAME', 'L2', [
          node('FRAME', 'L3', [
            node('FRAME', 'L4', [
              node('RECTANGLE', 'TooDeep'),
            ]),
          ]),
        ]),
      ]),
    ]);
    expect(findFillShapeInContainer(container)).toBeNull();
  });
});

// =============================================================================
// FILL TARGETING: COMPONENT_SET GUARD
// =============================================================================

describe('findFillShapeInContainer — COMPONENT_SET', () => {
  it('never selects COMPONENT_SET root as target (searches inside)', () => {
    const set = node('COMPONENT_SET', 'LoginButton', [
      baseVariant(),
      hoverVariant(),
    ]);
    // If a COMPONENT_SET somehow reaches the resolver, it should look inside
    // and find a RECTANGLE in one of the variant children
    const result = findFillShapeInContainer(set)!;
    expect(result.type).toBe('RECTANGLE');
  });
});

// =============================================================================
// LOGIN BUTTON DEMO SCENARIO
// =============================================================================

describe('LoginButton demo — fill targeting', () => {
  it('bare LoginButton base variant: fill targets RECTANGLE, not TEXT', () => {
    // After resolveTargetNode routes bare "LoginButton" to the base COMPONENT,
    // executeSetFill calls findFillShapeInContainer on that COMPONENT
    const base = baseVariant('Login');
    const result = findFillShapeInContainer(base)!;
    expect(result).not.toBeNull();
    expect(result.type).toBe('RECTANGLE');
    expect(result.name).toBe('Background');
  });

  it('LoginButton::hover variant: fill targets RECTANGLE, not TEXT', () => {
    const hover = hoverVariant('Login');
    const result = findFillShapeInContainer(hover)!;
    expect(result).not.toBeNull();
    expect(result.type).toBe('RECTANGLE');
    expect(result.name).toBe('Background');
  });

  it('does not apply fill to the outer COMPONENT_SET container', () => {
    // The COMPONENT_SET itself is not a shape, so even if reached it
    // would be handled by the container path in executeSetFill
    expect(FILL_SHAPE_TYPES.has('COMPONENT_SET')).toBe(false);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('findFillShapeInContainer — edge cases', () => {
  it('returns null for empty container', () => {
    expect(findFillShapeInContainer(node('FRAME', 'Empty', []))).toBeNull();
  });

  it('returns null for node without children', () => {
    expect(findFillShapeInContainer(node('RECTANGLE', 'Leaf'))).toBeNull();
  });

  it('returns VECTOR shapes', () => {
    const container = node('COMPONENT', 'Icon', [
      node('VECTOR', 'Path'),
    ]);
    expect(findFillShapeInContainer(container)!.type).toBe('VECTOR');
  });

  it('returns BOOLEAN_OPERATION shapes', () => {
    const container = node('COMPONENT', 'Complex', [
      node('BOOLEAN_OPERATION', 'Union'),
    ]);
    expect(findFillShapeInContainer(container)!.type).toBe('BOOLEAN_OPERATION');
  });
});

// =============================================================================
// SELF_FILL_TYPES ALLOWLIST
// =============================================================================

describe('SELF_FILL_TYPES allowlist', () => {
  it('includes FRAME, COMPONENT, INSTANCE', () => {
    expect(SELF_FILL_TYPES.has('FRAME')).toBe(true);
    expect(SELF_FILL_TYPES.has('COMPONENT')).toBe(true);
    expect(SELF_FILL_TYPES.has('INSTANCE')).toBe(true);
  });

  it('excludes organizational wrappers', () => {
    expect(SELF_FILL_TYPES.has('COMPONENT_SET')).toBe(false);
    expect(SELF_FILL_TYPES.has('GROUP')).toBe(false);
  });

  it('excludes TEXT', () => {
    expect(SELF_FILL_TYPES.has('TEXT')).toBe(false);
  });
});

// =============================================================================
// resolveFillTarget — FULL TWO-TIER POLICY
// =============================================================================

describe('resolveFillTarget — direct shape', () => {
  it('RECTANGLE fills directly', () => {
    const r = resolveFillTarget(node('RECTANGLE', 'Box'));
    expect(r.targetMode).toBe('direct-shape');
    expect(r.target!.name).toBe('Box');
    expect(r.childSearchRan).toBe(false);
  });

  it('ELLIPSE fills directly', () => {
    const r = resolveFillTarget(node('ELLIPSE', 'Circle'));
    expect(r.targetMode).toBe('direct-shape');
    expect(r.target!.name).toBe('Circle');
  });
});

describe('resolveFillTarget — child-visual (container with child shape)', () => {
  it('COMPONENT with RECTANGLE child → child-visual', () => {
    const r = resolveFillTarget(baseVariant());
    expect(r.targetMode).toBe('child-visual');
    expect(r.target!.type).toBe('RECTANGLE');
    expect(r.childSearchRan).toBe(true);
  });

  it('FRAME with RECTANGLE child → child-visual', () => {
    const frame = node('FRAME', 'TestBox', [
      node('RECTANGLE', 'Bg'),
    ]);
    const r = resolveFillTarget(frame);
    expect(r.targetMode).toBe('child-visual');
    expect(r.target!.type).toBe('RECTANGLE');
  });

  it('INSTANCE with RECTANGLE child → child-visual', () => {
    const inst = node('INSTANCE', 'LoginBtn', [
      node('RECTANGLE', 'Bg'),
      node('TEXT', 'Login'),
    ]);
    const r = resolveFillTarget(inst);
    expect(r.targetMode).toBe('child-visual');
    expect(r.target!.type).toBe('RECTANGLE');
  });
});

describe('resolveFillTarget — container-self (no child shape)', () => {
  it('COMPONENT with only TEXT children → fills COMPONENT itself', () => {
    const comp = node('COMPONENT', 'State=Default', [
      node('TEXT', 'Login'),
    ]);
    const r = resolveFillTarget(comp);
    expect(r.targetMode).toBe('container-self');
    expect(r.target).toBe(comp);
    expect(r.childSearchRan).toBe(true);
    expect(r.selfFillConsidered).toBe(true);
  });

  it('FRAME with no children → fills FRAME itself (TestBox scenario)', () => {
    const frame = node('FRAME', 'TestBox', []);
    const r = resolveFillTarget(frame);
    expect(r.targetMode).toBe('container-self');
    expect(r.target).toBe(frame);
  });

  it('INSTANCE with only TEXT children → fills INSTANCE itself', () => {
    const inst = node('INSTANCE', 'LoginBtn', [
      node('TEXT', 'Login'),
    ]);
    const r = resolveFillTarget(inst);
    expect(r.targetMode).toBe('container-self');
    expect(r.target).toBe(inst);
  });

  it('COMPONENT with no children at all → fills COMPONENT itself', () => {
    const comp = node('COMPONENT', 'Empty', []);
    const r = resolveFillTarget(comp);
    expect(r.targetMode).toBe('container-self');
    expect(r.target).toBe(comp);
  });
});

describe('resolveFillTarget — rejected types', () => {
  it('TEXT is rejected unconditionally', () => {
    const r = resolveFillTarget(node('TEXT', 'Label'));
    expect(r.targetMode).toBe('rejected-text');
    expect(r.target).toBeNull();
  });

  it('COMPONENT_SET is rejected unconditionally', () => {
    const r = resolveFillTarget(node('COMPONENT_SET', 'LoginButton', [
      baseVariant(),
    ]));
    expect(r.targetMode).toBe('rejected-component-set');
    expect(r.target).toBeNull();
  });
});

describe('resolveFillTarget — ambiguous skip', () => {
  it('GROUP with no child shapes → skip', () => {
    const group = node('GROUP', 'Wrapper', [
      node('TEXT', 'Label'),
    ]);
    const r = resolveFillTarget(group);
    expect(r.targetMode).toBe('ambiguous-skip');
    expect(r.target).toBeNull();
  });

  it('unknown type → skip', () => {
    const r = resolveFillTarget(node('SLICE', 'Export'));
    expect(r.targetMode).toBe('ambiguous-skip');
    expect(r.target).toBeNull();
  });
});

describe('resolveFillTarget — demo scenario: LoginButton with no inner RECTANGLE', () => {
  it('bare LoginButton → COMPONENT (State=Default) with only TEXT → container-self', () => {
    // This matches the actual Figma scene: the COMPONENT carries the background
    // fill directly, there is no inner RECTANGLE shape.
    const baseVariantNoRect = node('COMPONENT', 'State=Default', [
      node('TEXT', 'Login'),
    ]);
    const r = resolveFillTarget(baseVariantNoRect);
    expect(r.targetMode).toBe('container-self');
    expect(r.target).toBe(baseVariantNoRect);
    expect(r.target!.type).toBe('COMPONENT');
  });

  it('hover LoginButton → COMPONENT (State=Hover) with only TEXT → container-self', () => {
    const hoverVariantNoRect = node('COMPONENT', 'State=Hover', [
      node('TEXT', 'Login'),
    ]);
    const r = resolveFillTarget(hoverVariantNoRect);
    expect(r.targetMode).toBe('container-self');
    expect(r.target).toBe(hoverVariantNoRect);
  });

  it('TestBox FRAME with no children → container-self', () => {
    const testBox = node('FRAME', 'TestBox', []);
    const r = resolveFillTarget(testBox);
    expect(r.targetMode).toBe('container-self');
    expect(r.target).toBe(testBox);
  });
});
