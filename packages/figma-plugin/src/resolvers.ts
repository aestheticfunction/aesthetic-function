/**
 * Operation-specific target resolvers — testable pure functions.
 *
 * WHY: Extracted from code.ts so the fill-targeting logic can be unit tested
 * without the Figma plugin sandbox. code.ts has the same algorithm inlined
 * for bundle simplicity; the tests here validate the algorithm.
 *
 * INVARIANTS:
 * - findFillShapeInContainer NEVER returns TEXT nodes (shape allowlist)
 * - resolveFillTarget prefers child shapes, falls back to container-self
 *   for FRAME/COMPONENT/INSTANCE, rejects TEXT and COMPONENT_SET
 */

/** Visual shape types valid for SET_FILL. TEXT is intentionally excluded. */
export const FILL_SHAPE_TYPES = new Set([
  'RECTANGLE', 'ELLIPSE', 'VECTOR', 'LINE', 'STAR', 'POLYGON', 'BOOLEAN_OPERATION',
]);

/** Container types that may wrap visual children. */
export const FILL_CONTAINER_TYPES = new Set([
  'COMPONENT', 'COMPONENT_SET', 'FRAME', 'INSTANCE', 'GROUP',
]);

/**
 * Container types that can own their own visible background fill.
 * WHY: FRAME, COMPONENT, and INSTANCE commonly carry the background fill
 * directly (no inner RECTANGLE). This is normal Figma structure.
 * COMPONENT_SET and GROUP are excluded — they are organizational wrappers.
 */
export const SELF_FILL_TYPES = new Set([
  'FRAME', 'COMPONENT', 'INSTANCE',
]);

/** Minimal node interface for testing without Figma API. */
export interface MockNode {
  type: string;
  name: string;
  id?: string;
  visible?: boolean;
  children?: MockNode[];
}

/** Result of resolveFillTarget with diagnostic metadata. */
export interface FillTargetResult {
  target: MockNode | null;
  targetMode: 'direct-shape' | 'child-visual' | 'container-self' | 'rejected-text' | 'rejected-component-set' | 'ambiguous-skip';
  childSearchRan: boolean;
  selfFillConsidered: boolean;
}

/**
 * Find the visual shape target for SET_FILL inside a container.
 * Returns null if no child shape exists.
 *
 * INVARIANT: Never returns a TEXT node.
 */
export function findFillShapeInContainer(
  container: MockNode,
  depth: number = 0
): MockNode | null {
  if (!container.children) return null;
  if (depth > 3) return null;

  const children = container.children;

  // 1. Direct child named "background" or "fill" that is a shape
  for (const child of children) {
    if (
      FILL_SHAPE_TYPES.has(child.type) &&
      (child.name.toLowerCase() === 'background' || child.name.toLowerCase() === 'fill')
    ) {
      return child;
    }
  }

  // 2. First direct child that is a shape type
  for (const child of children) {
    if (FILL_SHAPE_TYPES.has(child.type)) {
      return child;
    }
  }

  // 3. Recurse into container children only
  for (const child of children) {
    if (FILL_CONTAINER_TYPES.has(child.type) && child.children) {
      const nested = findFillShapeInContainer(child, depth + 1);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Resolve the fill target for a given node.
 *
 * Policy (deterministic, ordered):
 * 1. TEXT → rejected unconditionally
 * 2. COMPONENT_SET → rejected unconditionally
 * 3. Shape type → fill directly (direct-shape)
 * 4. Container → prefer child shape (child-visual)
 * 5. Container with no child shape + SELF_FILL_TYPES → container-self
 * 6. Otherwise → ambiguous-skip
 *
 * INVARIANT: Never targets TEXT. Never targets COMPONENT_SET.
 */
export function resolveFillTarget(node: MockNode): FillTargetResult {
  // Reject TEXT unconditionally
  if (node.type === 'TEXT') {
    return { target: null, targetMode: 'rejected-text', childSearchRan: false, selfFillConsidered: false };
  }

  // Reject COMPONENT_SET unconditionally
  if (node.type === 'COMPONENT_SET') {
    return { target: null, targetMode: 'rejected-component-set', childSearchRan: false, selfFillConsidered: false };
  }

  // Shape type → fill directly
  if (FILL_SHAPE_TYPES.has(node.type)) {
    return { target: node, targetMode: 'direct-shape', childSearchRan: false, selfFillConsidered: false };
  }

  // Container → prefer child shape, fall back to container-self
  if (FILL_CONTAINER_TYPES.has(node.type)) {
    const shape = findFillShapeInContainer(node);
    if (shape) {
      return { target: shape, targetMode: 'child-visual', childSearchRan: true, selfFillConsidered: false };
    }
    // No child shape — allow self-fill for FRAME/COMPONENT/INSTANCE
    if (SELF_FILL_TYPES.has(node.type)) {
      return { target: node, targetMode: 'container-self', childSearchRan: true, selfFillConsidered: true };
    }
    // GROUP or other container without self-fill capability
    return { target: null, targetMode: 'ambiguous-skip', childSearchRan: true, selfFillConsidered: false };
  }

  // Unknown type
  return { target: null, targetMode: 'ambiguous-skip', childSearchRan: false, selfFillConsidered: false };
}
