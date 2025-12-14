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

/**
 * Find a node by name in the current page
 */
function findNodeByName(name: string): SceneNode | null {
  return figma.currentPage.findOne((node) => node.name === name);
}

/**
 * Get the target node for an operation:
 * 1. If nodeId provided, find by ID (return null if not found)
 * 2. If nodeQuery provided, find by name (return null if not found - NO fallback)
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

  // Try by name query
  if (op.nodeQuery) {
    const node = findNodeByName(op.nodeQuery);
    if (node) return node;
    // nodeQuery provided but not found - do not fall back to selection
    console.warn(`[Plugin] Node not found by name: "${op.nodeQuery}" - skipping operation`);
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
        error: `Node "${node.name}" (${node.type}) has no TEXT descendant`,
      };
    }
    console.log(`[Plugin] Resolved nested TEXT node "${textNode.name}" inside "${node.name}"`);
  }

  try {
    // Load font before modifying text
    // WHY: Figma requires fonts to be loaded before text mutations
    await figma.loadFontAsync(textNode.fontName as FontName);
    textNode.characters = op.text;
    console.log(`[Plugin] SET_TEXT: "${op.text}" on node "${textNode.name}"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to set text: ${err}` };
  }
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
 * Execute all operations in a batch
 */
async function executeOperations(
  operations: TestOperation[],
  _requestId?: string
): Promise<{ success: boolean; results: Array<{ success: boolean; error?: string }> }> {
  const results: Array<{ success: boolean; error?: string }> = [];
  let allSuccess = true;

  for (const op of operations) {
    const result = await executeOperation(op);
    results.push(result);
    if (!result.success) {
      allSuccess = false;
      console.error(`[Plugin] Operation failed:`, result.error);
    }
  }

  return { success: allSuccess, results };
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

      // Send result back to ui.html
      figma.ui.postMessage({
        type: 'OPERATION_RESULT',
        payload: {
          requestId: payload.requestId,
          success: result.success,
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

      console.log(`[Plugin] Captured ${changes.length} change(s) from "${node.name}"`);

      // Send to ui.html for forwarding to server
      figma.ui.postMessage({
        type: 'SELECTION_CAPTURED',
        payload: {
          nodeId: node.id,
          nodeName: node.name,
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
