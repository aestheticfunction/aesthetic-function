/**
 * @aesthetic-function/figma-plugin - code.ts
 *
 * RUNTIME: Figma Sandbox (code.ts)
 * RESPONSIBILITIES:
 *   - Receives Figma Operations from ui.html via postMessage
 *   - Mutates the Figma Scene Graph
 *
 * CAN: Access Figma Plugin API, mutate nodes
 * CANNOT: Access network, access filesystem
 *
 * Communication flow:
 *   Server → ui.html (network) → code.ts (postMessage) → Figma Scene Graph
 */

// =============================================================================
// TYPES (subset of protocol, inlined to avoid bundling issues)
// =============================================================================

/**
 * Simplified operation types for Phase 1 testing.
 * Supports SET_TEXT and SET_FILL operations.
 */
interface SetTextOperation {
  op: 'SET_TEXT';
  /** Target node ID, or null to use selection/query */
  nodeId?: string | null;
  /** Query node by name if nodeId not provided */
  nodeQuery?: string;
  /** New text content */
  text: string;
}

interface SetFillOperation {
  op: 'SET_FILL';
  /** Target node ID, or null to use selection/query */
  nodeId?: string | null;
  /** Query node by name if nodeId not provided */
  nodeQuery?: string;
  /** Fill color as hex (e.g., "#FF0000") */
  color: string;
}

type TestOperation = SetTextOperation | SetFillOperation;

interface ApplyOperationsPayload {
  operations: TestOperation[];
  requestId?: string;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Debug flag: Set to true to log discovered Component Sets on connect.
 * Enable via: figma.clientStorage.setAsync('DEBUG_LIST_VARIANTS', true)
 */
let DEBUG_LIST_VARIANTS = false;

/**
 * Parse hex color to Figma RGB (0-1 range)
 */
function hexToRgb(hex: string): RGB {
  const cleanHex = hex.replace('#', '');
  const bigint = parseInt(cleanHex, 16);
  return {
    r: ((bigint >> 16) & 255) / 255,
    g: ((bigint >> 8) & 255) / 255,
    b: (bigint & 255) / 255,
  };
}

/**
 * Convert Figma RGB (0-1 range) to hex string
 */
function rgbToHex(rgb: RGB): string {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// =============================================================================
// VARIANT QUERY PARSING (Phase 8B)
// =============================================================================

/**
 * Parsed variant query result.
 *
 * WHY: We use the LoginButton::hover convention to target Figma Component Set variants.
 * The :: separator is deterministic and maps to Figma's variant properties.
 *
 * CONVENTION:
 * - LoginButton → base variant (State=Base or Default)
 * - LoginButton::hover → variant with State=Hover
 * - LoginButton::disabled → variant with State=Disabled
 * - LoginButton::pressed → variant with State=Pressed
 */
interface VariantQuery {
  /** Base component/node name (e.g., "LoginButton") */
  baseName: string;
  /** Variant state (null = base state, no variant selection) */
  variantState: string | null;
  /** Original query string */
  original: string;
}

/**
 * State mapping from marker syntax to Figma variant property values.
 *
 * WHY: Figma variant properties are case-sensitive and often use Title Case.
 * We map lowercase state keywords to common Figma naming conventions.
 */
const STATE_TO_FIGMA_VARIANT: Record<string, string[]> = {
  hover: ['Hover', 'hover', 'HOVER'],
  disabled: ['Disabled', 'disabled', 'DISABLED'],
  pressed: ['Pressed', 'pressed', 'PRESSED', 'Active', 'active'],
  base: ['Base', 'Default', 'default', 'base'],
};

/**
 * Parse a nodeQuery string into base name and variant state.
 *
 * Examples:
 *   "LoginButton" → { baseName: "LoginButton", variantState: null }
 *   "LoginButton::hover" → { baseName: "LoginButton", variantState: "hover" }
 *   "LoginButton::disabled" → { baseName: "LoginButton", variantState: "disabled" }
 */
function parseVariantQuery(nodeQuery: string): VariantQuery {
  const parts = nodeQuery.split('::');
  if (parts.length === 2 && parts[1]) {
    return {
      baseName: parts[0],
      variantState: parts[1].toLowerCase(),
      original: nodeQuery,
    };
  }
  return {
    baseName: nodeQuery,
    variantState: null,
    original: nodeQuery,
  };
}

/**
 * Variant resolution result.
 */
interface VariantResolution {
  /** Resolved node (null if not found) */
  node: SceneNode | null;
  /** Error message if resolution failed */
  error?: string;
  /** Source of resolution: 'variant', 'name', 'selection' */
  source: 'variant' | 'name' | 'selection' | 'none';
}

/**
 * Find all Component Sets in the current page.
 */
function findAllComponentSets(): ComponentSetNode[] {
  const sets: ComponentSetNode[] = [];
  figma.currentPage.findAll((node) => {
    if (node.type === 'COMPONENT_SET') {
      sets.push(node as ComponentSetNode);
    }
    return false; // Continue searching
  });
  return sets;
}

/**
 * Find a Component Set by name.
 * Returns error if multiple sets share the same name.
 */
function findComponentSetByName(
  name: string
): { set: ComponentSetNode | null; error?: string; candidates?: string[] } {
  const allSets = findAllComponentSets();
  const matches = allSets.filter((set) => set.name === name);

  if (matches.length === 0) {
    return { set: null };
  }
  if (matches.length === 1) {
    return { set: matches[0] };
  }
  // Multiple matches - ambiguous
  return {
    set: null,
    error: `Ambiguous: Multiple Component Sets named "${name}" found`,
    candidates: matches.map((s) => `${s.name} (id=${s.id})`),
  };
}

/**
 * Get all variant components from a Component Set with their properties.
 */
function getVariantComponents(
  set: ComponentSetNode
): Array<{ component: ComponentNode; properties: Record<string, string> }> {
  const variants: Array<{ component: ComponentNode; properties: Record<string, string> }> = [];

  for (const child of set.children) {
    if (child.type === 'COMPONENT') {
      // Parse variant properties from the component name
      // Figma format: "Property1=Value1, Property2=Value2"
      const props: Record<string, string> = {};
      const propPairs = child.name.split(',').map((s) => s.trim());
      for (const pair of propPairs) {
        const [key, value] = pair.split('=').map((s) => s.trim());
        if (key && value) {
          props[key] = value;
        }
      }
      variants.push({ component: child as ComponentNode, properties: props });
    }
  }
  return variants;
}

/**
 * Find a variant component matching the requested state.
 *
 * @param set - Component Set to search in
 * @param state - Requested state (hover, disabled, pressed, or null for base)
 * @returns The matching variant component, or null with error details
 */
function findVariantByState(
  set: ComponentSetNode,
  state: string | null
): { component: ComponentNode | null; error?: string; available?: string[] } {
  const variants = getVariantComponents(set);
  const available: string[] = [];

  // Determine which Figma property values to look for
  // WHY: Figma variant properties can have various names (State, state, Variant, etc.)
  // We check common property names and match against the state mapping
  const stateKey = state || 'base';
  const targetValues = STATE_TO_FIGMA_VARIANT[stateKey] || [state || 'Base'];

  for (const v of variants) {
    // Collect available states for error messages
    const stateValue = v.properties['State'] || v.properties['state'] || v.properties['Variant'] || 'unknown';
    available.push(stateValue);

    // Check if this variant matches our target state
    const variantStateValue = v.properties['State'] || v.properties['state'] || v.properties['Variant'];
    if (variantStateValue && targetValues.includes(variantStateValue)) {
      return { component: v.component };
    }
  }

  // Not found
  return {
    component: null,
    error: `Variant not found: ${set.name} State=${state || 'Base'} (available: ${available.join(', ')})`,
    available,
  };
}

/**
 * Resolve a nodeQuery to a target node using variant-aware resolution.
 *
 * Resolution order:
 * 1. Parse nodeQuery for variant intent (e.g., "LoginButton::hover")
 * 2. If variant query, find Component Set and resolve variant
 * 3. Else, fall back to existing "find by name" behavior
 *
 * @param nodeQuery - Node query string (possibly with ::state suffix)
 * @param selection - Optional current selection to check first
 * @returns Resolution result with node or error
 */
function resolveTargetNode(
  nodeQuery: string,
  selection?: readonly SceneNode[]
): VariantResolution {
  const parsed = parseVariantQuery(nodeQuery);

  // If variant state is specified, try Component Set resolution first
  if (parsed.variantState !== null) {
    const setResult = findComponentSetByName(parsed.baseName);

    if (setResult.error) {
      return { node: null, error: setResult.error, source: 'none' };
    }

    if (setResult.set) {
      // Found a Component Set - resolve the variant
      const variantResult = findVariantByState(setResult.set, parsed.variantState);

      if (variantResult.component) {
        console.log(
          `[Plugin] Resolved variant: ${parsed.baseName}::${parsed.variantState} → ${variantResult.component.name}`
        );
        return { node: variantResult.component, source: 'variant' };
      }

      // Component Set exists but variant not found
      return {
        node: null,
        error: variantResult.error,
        source: 'none',
      };
    }

    // No Component Set found - fall back to literal name search
    // (e.g., user might have a node literally named "LoginButton::hover")
    const literalNode = findNodeByName(nodeQuery);
    if (literalNode) {
      console.log(`[Plugin] Found literal node: "${nodeQuery}"`);
      return { node: literalNode, source: 'name' };
    }

    // Also try base name for legacy compatibility
    const baseNode = findNodeByName(parsed.baseName);
    if (baseNode) {
      console.log(`[Plugin] Falling back to base node: "${parsed.baseName}" (no Component Set found)`);
      return { node: baseNode, source: 'name' };
    }

    return {
      node: null,
      error: `No Component Set or node found for "${parsed.baseName}"`,
      source: 'none',
    };
  }

  // No variant state - standard resolution
  const node = findNodeByName(nodeQuery);
  if (node) {
    return { node, source: 'name' };
  }

  // Fall back to selection only if explicitly provided
  if (selection && selection.length > 0) {
    return { node: selection[0], source: 'selection' };
  }

  return { node: null, source: 'none' };
}

/**
 * Derive a node name that includes variant state if the node is a variant component.
 *
 * This is used in CAPTURE_SELECTION to generate a "ComponentName::state" format
 * that can be used for Code ↔ Design sync with proper variant targeting.
 *
 * Detection logic:
 * 1. If node is a COMPONENT inside a COMPONENT_SET, extract State property
 * 2. If node is an INSTANCE, check if it has variantProperties
 * 3. Otherwise, just return the node name as-is
 *
 * @param node - The selected node
 * @returns Node name, possibly with ::state suffix
 */
function deriveVariantNodeName(node: SceneNode): string {
  // Case 1: Node is a ComponentNode inside a ComponentSetNode
  if (node.type === 'COMPONENT') {
    const parent = node.parent;
    if (parent && parent.type === 'COMPONENT_SET') {
      // This is a variant component - derive state from its variantProperties
      const variantProps = (node as ComponentNode).variantProperties;
      if (variantProps) {
        // Look for State or state property
        const stateValue = variantProps['State'] || variantProps['state'] || variantProps['Variant'];
        if (stateValue) {
          // Map Figma value back to our convention
          const stateKey = figmaValueToStateKey(stateValue);
          // Use parent set name as base, since that's the component name
          return `${parent.name}::${stateKey}`;
        }
      }
      // Variant but no State property - return parent name (base variant)
      return parent.name;
    }
  }

  // Case 2: Node is an INSTANCE - check if it has variant properties
  if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    // Check if this is an instance of a variant
    const mainComponent = instance.mainComponent;
    if (mainComponent) {
      const parent = mainComponent.parent;
      if (parent && parent.type === 'COMPONENT_SET') {
        // This is an instance of a variant
        const variantProps = mainComponent.variantProperties;
        if (variantProps) {
          const stateValue = variantProps['State'] || variantProps['state'] || variantProps['Variant'];
          if (stateValue) {
            const stateKey = figmaValueToStateKey(stateValue);
            return `${parent.name}::${stateKey}`;
          }
        }
        // Variant instance but no State property
        return parent.name;
      }
    }
  }

  // Default: return node name as-is
  return node.name;
}

/**
 * Map a Figma variant property value back to our state key convention.
 *
 * Figma uses capitalized values (Hover, Disabled, Pressed) while our convention
 * uses lowercase (hover, disabled, pressed).
 */
function figmaValueToStateKey(figmaValue: string): string {
  const lowerValue = figmaValue.toLowerCase();

  // Check if it maps to a known state
  for (const [key, values] of Object.entries(STATE_TO_FIGMA_VARIANT)) {
    if (values.map((v) => v.toLowerCase()).includes(lowerValue)) {
      return key;
    }
  }

  // Unknown value - return as-is (lowercase)
  return lowerValue;
}

/**
 * Find a node by name in the current page
 */
function findNodeByName(name: string): SceneNode | null {
  return figma.currentPage.findOne((node) => node.name === name);
}

/**
 * Get the target node for an operation:
 * 1. If nodeId provided, find by ID (return null if not found)
 * 2. If nodeQuery provided, use variant-aware resolution:
 *    a. Parse for ::state suffix (e.g., "LoginButton::hover")
 *    b. If variant query, find Component Set and resolve variant
 *    c. Else, find by literal name
 * 3. Only fall back to selection when neither nodeId nor nodeQuery is provided
 */
function getTargetNode(op: { nodeId?: string | null; nodeQuery?: string }): SceneNode | null {
  // Try by ID first
  if (op.nodeId) {
    const node = figma.getNodeById(op.nodeId);
    if (node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
      return node as SceneNode;
    }
    // nodeId provided but not found - do not fall back
    console.warn(`[Plugin] Node not found by ID: ${op.nodeId}`);
    return null;
  }

  // Try by name query with variant-aware resolution
  if (op.nodeQuery) {
    const resolution = resolveTargetNode(op.nodeQuery);
    
    if (resolution.node) {
      return resolution.node;
    }
    
    if (resolution.error) {
      console.warn(`[Plugin] ${resolution.error}`);
    } else {
      console.warn(`[Plugin] Node not found by name: "${op.nodeQuery}" - skipping operation`);
    }
    return null;
  }

  // Only fall back to selection when no nodeId/nodeQuery specified
  const selection = figma.currentPage.selection;
  if (selection.length > 0) {
    return selection[0];
  }

  return null;
}

// =============================================================================
// OPERATION EXECUTORS
// =============================================================================

/**
 * Find a TEXT node within a container:
 * 1. Prefer a child named "text" (common convention)
 * 2. Otherwise use the first TEXT descendant
 */
function findTextInContainer(container: SceneNode): TextNode | null {
  if (!('findOne' in container)) return null;

  // Prefer a TEXT node named "text"
  const namedText = (container as ChildrenMixin).findOne(
    (n) => n.type === 'TEXT' && n.name.toLowerCase() === 'text'
  );
  if (namedText) return namedText as TextNode;

  // Fall back to first TEXT descendant
  const anyText = (container as ChildrenMixin).findOne((n) => n.type === 'TEXT');
  return anyText as TextNode | null;
}

/**
 * Execute SET_TEXT operation
 * Changes the text content of a text node.
 * If target is a container, finds a nested TEXT node.
 *
 * WHY: Properly handles mixed fonts by loading all fonts before setting text.
 */
async function executeSetText(op: SetTextOperation): Promise<{ success: boolean; error?: string }> {
  const node = getTargetNode(op);

  if (!node) {
    return { success: false, error: 'No target node found. Select a node or provide nodeId/nodeQuery.' };
  }

  // Determine the actual TEXT node to modify
  let textNode: TextNode | null = null;

  if (node.type === 'TEXT') {
    textNode = node as TextNode;
  } else {
    // Target is a container - find nested TEXT
    textNode = findTextInContainer(node);
    if (!textNode) {
      return {
        success: false,
        error: `No TEXT node found under "${node.name}"`,
      };
    }
    console.log(`[Plugin] Resolved nested TEXT node "${textNode.name}" inside "${node.name}"`);
  }

  try {
    // Load all fonts before modifying text
    // WHY: Figma requires fonts to be loaded before text mutations
    // Handle mixed fonts: fontName can be a FontName or figma.mixed symbol
    await loadAllFontsForTextNode(textNode);
    
    textNode.characters = op.text;
    console.log(`[Plugin] SET_TEXT: "${op.text}" on node "${textNode.name}"`);
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to set text: ${errMsg}` };
  }
}

/**
 * Load all fonts used in a text node.
 * Handles both single font and mixed fonts cases.
 */
async function loadAllFontsForTextNode(textNode: TextNode): Promise<void> {
  const fontName = textNode.fontName;
  
  // Check if it's a single font (not mixed)
  if (typeof fontName === 'object' && 'family' in fontName) {
    await figma.loadFontAsync(fontName as FontName);
    return;
  }
  
  // Mixed fonts: get all unique fonts in the text
  // WHY: When text has multiple fonts (e.g., bold + regular), we need to load all
  const len = textNode.characters.length;
  if (len === 0) {
    // Empty text - load any font we can find
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    return;
  }
  
  // Get all fonts used in the range
  const allFonts = textNode.getRangeAllFontNames(0, len);
  const uniqueFonts = new Map<string, FontName>();
  
  for (const font of allFonts) {
    const key = `${font.family}::${font.style}`;
    if (!uniqueFonts.has(key)) {
      uniqueFonts.set(key, font);
    }
  }
  
  // Load all unique fonts
  const loadPromises: Promise<void>[] = [];
  for (const font of uniqueFonts.values()) {
    loadPromises.push(figma.loadFontAsync(font));
  }
  await Promise.all(loadPromises);
}

/**
 * Execute SET_FILL operation
 * Changes the fill color of a node that supports fills
 */
function executeSetFill(op: SetFillOperation): { success: boolean; error?: string } {
  const node = getTargetNode(op);

  if (!node) {
    return { success: false, error: 'No target node found. Select a node or provide nodeId/nodeQuery.' };
  }

  // Check if node supports fills
  if (!('fills' in node)) {
    return { success: false, error: `Node "${node.name}" (${node.type}) does not support fills` };
  }

  try {
    const rgb = hexToRgb(op.color);
    // WHY: Figma fills are readonly, so we must replace the entire array
    (node as GeometryMixin).fills = [{ type: 'SOLID', color: rgb }];
    console.log(`[Plugin] SET_FILL: "${op.color}" on node "${node.name}"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to set fill: ${err}` };
  }
}

/**
 * Per-operation result with details for debugging
 */
interface OpResult {
  /** Index in the operations array */
  index: number;
  /** Operation type (SET_TEXT, SET_FILL) */
  action: string;
  /** Target node query/name */
  nodeQuery: string | null;
  /** Whether operation succeeded */
  ok: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Execute a single operation
 */
async function executeOperation(op: TestOperation): Promise<{ success: boolean; error?: string }> {
  switch (op.op) {
    case 'SET_TEXT':
      return executeSetText(op);
    case 'SET_FILL':
      return executeSetFill(op);
    default:
      return { success: false, error: `Unknown operation: ${(op as { op: string }).op}` };
  }
}

/**
 * Execute all operations in a batch.
 * Best-effort: continues executing remaining ops even if one fails.
 */
async function executeOperations(
  operations: TestOperation[],
  _requestId?: string
): Promise<{ success: boolean; results: OpResult[]; successCount: number; failCount: number }> {
  const results: OpResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const result = await executeOperation(op);
    
    const opResult: OpResult = {
      index: i,
      action: op.op,
      nodeQuery: op.nodeQuery || null,
      ok: result.success,
    };
    
    if (!result.success) {
      opResult.error = result.error || 'Unknown error';
      failCount++;
      console.error(`[Plugin] Op ${i} (${op.op}) failed:`, result.error);
    } else {
      successCount++;
    }
    
    results.push(opResult);
  }

  return { 
    success: failCount === 0, 
    results, 
    successCount, 
    failCount 
  };
}

// =============================================================================
// MAIN MESSAGE HANDLER
// =============================================================================

// Show the plugin UI
figma.showUI(__html__, { width: 400, height: 350 });

/**
 * Handle messages from ui.html
 * ui.html is responsible for network communication and forwards
 * Figma Operations to this sandbox for execution.
 */
figma.ui.onmessage = async (msg: { type: string; payload?: unknown }) => {
  console.log('[Figma Plugin] Received message:', msg.type);

  switch (msg.type) {
    case 'APPLY_OPERATIONS': {
      const payload = msg.payload as ApplyOperationsPayload;
      const ops = payload && payload.operations;
      if (!ops || !ops.length) {
        console.warn('[Plugin] APPLY_OPERATIONS with no operations');
        break;
      }

      console.log(`[Plugin] Executing ${ops.length} operation(s)...`);
      const result = await executeOperations(ops, payload.requestId);

      // Send detailed result back to ui.html
      figma.ui.postMessage({
        type: 'OPERATION_RESULT',
        payload: {
          requestId: payload.requestId,
          success: result.success,
          successCount: result.successCount,
          failCount: result.failCount,
          results: result.results,
        },
      });
      break;
    }

    case 'PING':
      // Health check from ui.html
      figma.ui.postMessage({ type: 'PONG' });
      break;

    case 'GET_SETTINGS': {
      // Retrieve stored settings from figma.clientStorage
      try {
        const serverUrl = await figma.clientStorage.getAsync('serverUrl');
        figma.ui.postMessage({
          type: 'SETTINGS',
          payload: { serverUrl: serverUrl || '' },
        });
      } catch (err) {
        console.error('[Plugin] Failed to get settings:', err);
        figma.ui.postMessage({
          type: 'SETTINGS',
          payload: { serverUrl: '' },
        });
      }
      break;
    }

    case 'SET_SETTINGS': {
      // Store settings to figma.clientStorage
      const settings = msg.payload as { serverUrl?: string };
      try {
        if (settings && settings.serverUrl !== undefined) {
          await figma.clientStorage.setAsync('serverUrl', settings.serverUrl);
          console.log('[Plugin] Settings saved');
        }
      } catch (err) {
        console.error('[Plugin] Failed to save settings:', err);
      }
      break;
    }

    case 'CAPTURE_SELECTION': {
      // Capture text and fill from current selection for Design → Code sync
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        console.warn('[Plugin] No selection to capture');
        figma.ui.postMessage({
          type: 'CAPTURE_ERROR',
          payload: { error: 'No selection. Select a node first.' },
        });
        break;
      }

      const node = selection[0];
      const changes: Array<{ changeType: 'text' | 'fill'; value: string }> = [];

      // Capture text content
      let textValue: string | null = null;
      if (node.type === 'TEXT') {
        textValue = (node as TextNode).characters;
      } else if ('findOne' in node) {
        // Container - find nested TEXT
        const textNode = (node as ChildrenMixin).findOne((n) => n.type === 'TEXT');
        if (textNode) {
          textValue = (textNode as TextNode).characters;
        }
      }
      if (textValue !== null) {
        changes.push({ changeType: 'text', value: textValue });
      }

      // Capture fill color (first solid fill)
      if ('fills' in node) {
        const fills = (node as GeometryMixin).fills;
        if (Array.isArray(fills) && fills.length > 0) {
          const firstFill = fills[0];
          if (firstFill.type === 'SOLID') {
            const hex = rgbToHex(firstFill.color);
            changes.push({ changeType: 'fill', value: hex });
          }
        }
      }

      if (changes.length === 0) {
        console.warn('[Plugin] No capturable properties on selection');
        figma.ui.postMessage({
          type: 'CAPTURE_ERROR',
          payload: { error: 'Selected node has no text or fill to capture.' },
        });
        break;
      }

      // Determine the node name, including variant state if applicable
      // This allows Code ↔ Design sync to use "ComponentName::state" format
      const resolvedNodeName = deriveVariantNodeName(node);
      
      console.log(`[Plugin] Captured ${changes.length} change(s) from "${resolvedNodeName}"`);

      // Send to ui.html for forwarding to server
      figma.ui.postMessage({
        type: 'SELECTION_CAPTURED',
        payload: {
          nodeId: node.id,
          nodeName: resolvedNodeName,
          changes,
          source: 'figma-plugin',
        },
      });
      break;
    }

    default:
      console.warn('[Figma Plugin] Unknown message type:', msg.type);
  }
};

console.log('[Figma Plugin] code.ts initialized');
console.log('[Figma Plugin] Supports: SET_TEXT, SET_FILL operations');

// Debug: List all Component Sets on the current page if DEBUG_LIST_VARIANTS is enabled
if (DEBUG_LIST_VARIANTS) {
  console.log('[Figma Plugin] DEBUG_LIST_VARIANTS enabled - scanning for Component Sets...');
  const sets = findAllComponentSets();
  if (sets.length === 0) {
    console.log('[Figma Plugin] No Component Sets found on current page');
  } else {
    console.log(`[Figma Plugin] Found ${sets.length} Component Set(s):`);
    for (const set of sets) {
      const variants = getVariantComponents(set);
      console.log(`  - "${set.name}" with ${variants.length} variant(s):`);
      for (const v of variants) {
        const stateValue = v.properties['State'] || v.properties['state'] || v.properties['Variant'] || 'N/A';
        console.log(`      • ${v.component.name} (State=${stateValue})`);
      }
    }
  }
}
