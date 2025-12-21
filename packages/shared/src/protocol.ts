/**
 * @aesthetic-function/shared - protocol.ts
 *
 * CANONICAL PROTOCOL DEFINITIONS
 *
 * This file defines ALL cross-process communication interfaces.
 * Every message between Watcher, Server, and Figma Plugin MUST
 * use these types.
 *
 * ARCHITECTURE REMINDER:
 *   - Intent Model: describes *what the UI is*
 *   - Figma Operations: describes *what to change in Figma*
 *   - Never send raw React ASTs to the plugin
 */

// =============================================================================
// PROTOCOL VERSION
// =============================================================================

/**
 * Semantic version for the protocol.
 * Bump this when making breaking changes to message formats.
 */
export const PROTOCOL_VERSION = '0.1.0';

// =============================================================================
// BASE MESSAGE ENVELOPE
// =============================================================================

/**
 * Every message MUST include these fields.
 * This ensures consistent handling across all runtimes.
 */
export interface BaseMessage<T extends string = string, P = unknown> {
  /** Protocol version for compatibility checking */
  version: string;
  /** Discriminator for message routing */
  type: T;
  /** Unique identifier for request/response correlation */
  requestId: string;
  /** Message-specific data */
  payload: P;
  /** ISO timestamp when message was created */
  timestamp: string;
}

/**
 * Helper to create a properly formatted message
 */
export function createMessage<T extends string, P>(
  type: T,
  payload: P,
  requestId?: string
): BaseMessage<T, P> {
  return {
    version: PROTOCOL_VERSION,
    type,
    requestId: requestId ?? generateRequestId(),
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// =============================================================================
// INTENT MODEL
// =============================================================================

/**
 * Intent Model describes *what the UI is* in a framework-agnostic way.
 * This is the intermediate representation between React code and Figma.
 *
 * WHY: Decouples React parsing from Figma operations.
 * The Watcher produces Intent, the Server relays it, and both
 * Watcher and Server can transform Intent → Figma Operations.
 */

/** Semantic design token reference */
export interface DesignToken {
  /** Token path, e.g. "colors.primary.500" */
  path: string;
  /** Resolved value for fallback, e.g. "#3B82F6" */
  resolvedValue: string;
}

/** CSS-like spacing values */
export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Layout direction for flex/autolayout */
export type LayoutDirection = 'horizontal' | 'vertical';

/** Alignment options */
export type Alignment = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

/** Text style properties */
export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  color?: DesignToken | string;
}

/** Common node properties */
export interface IntentNodeBase {
  /** Unique identifier for this node (derived from source location or component key) */
  id: string;
  /** Human-readable name for Figma layer */
  name: string;
  /** Source file and line number for debugging */
  sourceLocation?: {
    filePath: string;
    line: number;
    column: number;
  };
}

/**
 * Frame/Container node with AutoLayout properties
 * WHY: Maps to Figma Frame with AutoLayout
 */
export interface IntentFrameNode extends IntentNodeBase {
  type: 'frame';
  /** AutoLayout direction (CSS flex-direction → Figma layoutMode) */
  layoutDirection?: LayoutDirection;
  /** Gap between children (CSS gap → Figma itemSpacing) */
  gap?: number;
  /** Padding (CSS padding → Figma padding) */
  padding?: Spacing;
  /** Main axis alignment (CSS justify-content → Figma primaryAxisAlignItems) */
  mainAxisAlignment?: Alignment;
  /** Cross axis alignment (CSS align-items → Figma counterAxisAlignItems) */
  crossAxisAlignment?: Alignment;
  /** Background color */
  backgroundColor?: DesignToken | string;
  /** Border radius */
  cornerRadius?: number;
  /** Child nodes */
  children: IntentNode[];
}

/**
 * Text node
 * WHY: Maps to Figma TextNode
 */
export interface IntentTextNode extends IntentNodeBase {
  type: 'text';
  /** Text content */
  content: string;
  /** Text styling */
  style?: TextStyle;
}

/**
 * Component instance
 * WHY: Maps to Figma Component Instance or could be expanded inline
 */
export interface IntentComponentNode extends IntentNodeBase {
  type: 'component';
  /** Component name (e.g., "Button", "Card") */
  componentName: string;
  /** Variant properties if applicable */
  variant?: Record<string, string>;
  /** Props that affect visual representation */
  props: Record<string, unknown>;
  /** Rendered children (for slots) */
  children?: IntentNode[];
}

/**
 * Image/Icon placeholder
 * WHY: Maps to Figma Rectangle with image fill or SVG
 */
export interface IntentImageNode extends IntentNodeBase {
  type: 'image';
  /** Image source URL or asset reference */
  src?: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Dimensions */
  width?: number;
  height?: number;
}

/** Union of all Intent node types */
export type IntentNode =
  | IntentFrameNode
  | IntentTextNode
  | IntentComponentNode
  | IntentImageNode;

/**
 * Complete Intent Model for a React component/file
 */
export interface IntentModel {
  /** Root-level nodes */
  roots: IntentNode[];
  /** Source file path */
  sourceFile: string;
  /** Hash of source for change detection */
  sourceHash: string;
  /** Design tokens used in this model */
  tokensUsed: DesignToken[];
}

// =============================================================================
// FIGMA OPERATIONS
// =============================================================================

/**
 * Figma Operations describe *what to change in Figma*.
 * These are the actual mutations to be executed by code.ts.
 *
 * WHY: Separates "what we want" from "how to do it".
 * The plugin sandbox receives these pre-computed operations
 * and executes them without needing to understand Intent.
 */

/** Create a new Figma node */
export interface FigmaCreateOperation {
  op: 'create';
  /** Type of Figma node to create */
  nodeType: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'COMPONENT' | 'INSTANCE';
  /** ID to assign (for later reference) */
  id: string;
  /** Parent node ID (null for page-level) */
  parentId: string | null;
  /** Initial properties */
  properties: Record<string, unknown>;
}

/** Update properties of an existing node */
export interface FigmaUpdateOperation {
  op: 'update';
  /** Target node ID */
  id: string;
  /** Properties to update */
  properties: Record<string, unknown>;
}

/** Delete a node */
export interface FigmaDeleteOperation {
  op: 'delete';
  /** Target node ID */
  id: string;
}

/** Move a node to a new parent or position */
export interface FigmaMoveOperation {
  op: 'move';
  /** Target node ID */
  id: string;
  /** New parent ID */
  parentId: string;
  /** Index within parent's children */
  index?: number;
}

/** Batch multiple operations atomically */
export interface FigmaBatchOperation {
  op: 'batch';
  /** Operations to execute in order */
  operations: FigmaOperation[];
}

/** Union of all Figma operation types */
export type FigmaOperation =
  | FigmaCreateOperation
  | FigmaUpdateOperation
  | FigmaDeleteOperation
  | FigmaMoveOperation
  | FigmaBatchOperation;

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Message type discriminators.
 * Use these constants to avoid typos in message routing.
 */
export const MessageType = {
  // Watcher → Server
  FILE_CHANGED: 'FILE_CHANGED',
  INTENT_MODEL: 'INTENT_MODEL',
  FIGMA_OPERATIONS: 'FIGMA_OPERATIONS',

  // Server → Figma Plugin
  APPLY_OPERATIONS: 'APPLY_OPERATIONS',
  COMPOSE_OPERATIONS: 'COMPOSE_OPERATIONS',
  APPLY_PROPERTIES: 'APPLY_PROPERTIES',

  // Figma Plugin → Server
  OPERATION_RESULT: 'OPERATION_RESULT',
  COMPOSE_RESULT: 'COMPOSE_RESULT',
  APPLY_PROPERTIES_RESULT: 'APPLY_PROPERTIES_RESULT',
  PLUGIN_READY: 'PLUGIN_READY',

  // Figma Plugin → Server → Watcher (Design → Code)
  DESIGN_CHANGE: 'DESIGN_CHANGE',

  // Bidirectional
  PING: 'PING',
  PONG: 'PONG',
  ERROR: 'ERROR',
  ACK: 'ACK',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

// =============================================================================
// WATCHER → SERVER MESSAGES
// =============================================================================

/** Notification that a React file has changed */
export interface FileChangedPayload {
  filePath: string;
  changeType: 'create' | 'update' | 'delete';
  contentHash?: string;
}

export type FileChangedMessage = BaseMessage<
  typeof MessageType.FILE_CHANGED,
  FileChangedPayload
>;

/** Intent Model extracted from a React file */
export interface IntentModelPayload {
  model: IntentModel;
}

export type IntentModelMessage = BaseMessage<
  typeof MessageType.INTENT_MODEL,
  IntentModelPayload
>;

/** Figma Operations derived from Intent Model */
export interface FigmaOperationsPayload {
  /** Source file these operations relate to */
  sourceFile: string;
  /** Operations to apply */
  operations: FigmaOperation[];
}

export type FigmaOperationsMessage = BaseMessage<
  typeof MessageType.FIGMA_OPERATIONS,
  FigmaOperationsPayload
>;

// =============================================================================
// SERVER → FIGMA PLUGIN MESSAGES
// =============================================================================

/** Command to apply Figma operations */
export interface ApplyOperationsPayload {
  operations: FigmaOperation[];
  /** Original request ID for correlation */
  originRequestId: string;
}

export type ApplyOperationsMessage = BaseMessage<
  typeof MessageType.APPLY_OPERATIONS,
  ApplyOperationsPayload
>;

// =============================================================================
// COMPOSE OPERATIONS (Phase 11B)
// =============================================================================

import type { ComposeOpType } from './compose.js';

/**
 * A single compose operation to apply in Figma.
 */
export interface ComposeOperationItem {
  /** Deterministic hash of operation parameters */
  opId: string;
  /** Type of operation */
  type: ComposeOpType;
  /** Source component key */
  componentKey: string;
  /** Target Figma name */
  figmaName: string;
  /** Operation-specific payload */
  payload: Record<string, unknown>;
  /** Human-readable reason for the operation */
  reason: string;
  /** Source of the operation (e.g., 'figma-suggestions') */
  source: string;
}

/**
 * Result of a single compose operation.
 */
export interface ComposeOperationResultItem {
  opId: string;
  success: boolean;
  /** Created/found node ID if applicable */
  nodeId?: string;
  /** Error message if failed */
  error?: string;
  /** Whether the node already existed */
  existed?: boolean;
}

/** Command to apply compose operations (Server → Plugin) */
export interface ComposeOperationsPayload {
  operations: ComposeOperationItem[];
  /** Original request ID for correlation */
  originRequestId: string;
  /** Execution mode */
  mode: 'dry-run' | 'apply';
}

export type ComposeOperationsMessage = BaseMessage<
  typeof MessageType.COMPOSE_OPERATIONS,
  ComposeOperationsPayload
>;

/** Result of compose operations (Plugin → Server) */
export interface ComposeResultPayload {
  /** Original request ID this responds to */
  originRequestId: string;
  /** Whether all operations succeeded */
  success: boolean;
  /** Per-operation results */
  results: ComposeOperationResultItem[];
  /** Error details if failed */
  error?: string;
}

export type ComposeResultMessage = BaseMessage<
  typeof MessageType.COMPOSE_RESULT,
  ComposeResultPayload
>;

// =============================================================================
// APPLY PROPERTIES (Phase 11C)
// =============================================================================

/**
 * Property types that can be applied to Figma nodes.
 */
export type ApplyPropertyType =
  | 'fill'
  | 'textColor'
  | 'padding'
  | 'gap'
  | 'width'
  | 'height'
  | 'fontSize'
  | 'fontWeight';

/**
 * A single property apply operation to execute in Figma.
 */
export interface ApplyPropertyItem {
  /** Deterministic operation ID */
  opId: string;
  /** Target Figma node ID (must be stable ID from component-map) */
  nodeId: string;
  /** Property to apply */
  property: ApplyPropertyType;
  /** New value to apply */
  to: string | number;
  /** Canonical source token (for audit) */
  canonicalSource?: string;
}

/**
 * Result of a single property apply operation.
 */
export interface ApplyPropertyResultItem {
  opId: string;
  success: boolean;
  nodeId: string;
  property: ApplyPropertyType;
  /** Error message if failed */
  error?: string;
  /** Whether the value was already set (no change needed) */
  unchanged?: boolean;
}

/** Command to apply properties to Figma nodes (Server → Plugin) */
export interface ApplyPropertiesPayload {
  operations: ApplyPropertyItem[];
  /** Original request ID for correlation */
  originRequestId: string;
  /** Execution mode */
  mode: 'dry-run' | 'apply';
}

export type ApplyPropertiesMessage = BaseMessage<
  typeof MessageType.APPLY_PROPERTIES,
  ApplyPropertiesPayload
>;

/** Result of property application (Plugin → Server) */
export interface ApplyPropertiesResultPayload {
  /** Original request ID this responds to */
  originRequestId: string;
  /** Whether all operations succeeded */
  success: boolean;
  /** Per-operation results */
  results: ApplyPropertyResultItem[];
  /** Error details if failed */
  error?: string;
}

export type ApplyPropertiesResultMessage = BaseMessage<
  typeof MessageType.APPLY_PROPERTIES_RESULT,
  ApplyPropertiesResultPayload
>;

// =============================================================================
// FIGMA PLUGIN → SERVER MESSAGES
// =============================================================================

/** Result of applying operations */
export interface OperationResultPayload {
  /** Original request ID this responds to */
  originRequestId: string;
  /** Whether all operations succeeded */
  success: boolean;
  /** Created node IDs (for create operations) */
  createdNodeIds?: Record<string, string>;
  /** Error details if failed */
  error?: string;
}

export type OperationResultMessage = BaseMessage<
  typeof MessageType.OPERATION_RESULT,
  OperationResultPayload
>;

/** Plugin ready notification */
export interface PluginReadyPayload {
  /** Figma file key */
  fileKey: string;
  /** Current page ID */
  pageId: string;
  /** Plugin capabilities */
  capabilities: string[];
}

export type PluginReadyMessage = BaseMessage<
  typeof MessageType.PLUGIN_READY,
  PluginReadyPayload
>;

// =============================================================================
// FIGMA PLUGIN → SERVER → WATCHER MESSAGES (Design → Code)
// =============================================================================

/**
 * A single design change captured from Figma.
 * Represents a property change on a node.
 */
export interface DesignChangeItem {
  /** Type of change: text content or fill color */
  changeType: 'text' | 'fill';
  /** The value that was captured */
  value: string;
}

/**
 * Payload for DESIGN_CHANGE message.
 * Sent from Figma plugin when user captures selection changes.
 */
export interface DesignChangePayload {
  /** Figma node ID */
  nodeId: string;
  /** Figma node name (for matching to code) */
  nodeName: string;
  /** List of changes captured */
  changes: DesignChangeItem[];
  /** Source of the change */
  source: 'figma-plugin';
  /** Optional: associated file path if known */
  filePath?: string;
}

export type DesignChangeMessage = BaseMessage<
  typeof MessageType.DESIGN_CHANGE,
  DesignChangePayload
>;

// =============================================================================
// BIDIRECTIONAL MESSAGES
// =============================================================================

/** Health check ping */
export type PingMessage = BaseMessage<typeof MessageType.PING, object>;

/** Health check response */
export interface PongPayload {
  /** Uptime in seconds */
  uptime: number;
  /** Runtime identifier */
  runtime: 'watcher' | 'server' | 'figma-plugin';
}

export type PongMessage = BaseMessage<typeof MessageType.PONG, PongPayload>;

/** Error notification */
export interface ErrorPayload {
  /** Error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Original request ID if responding to a request */
  originRequestId?: string;
  /** Stack trace (debug only) */
  stack?: string;
}

export type ErrorMessage = BaseMessage<typeof MessageType.ERROR, ErrorPayload>;

/** Acknowledgment */
export interface AckPayload {
  /** Request ID being acknowledged */
  originRequestId: string;
}

export type AckMessage = BaseMessage<typeof MessageType.ACK, AckPayload>;

// =============================================================================
// UNION OF ALL MESSAGES
// =============================================================================

/**
 * Union type of all valid protocol messages.
 * Use this for generic message handling.
 */
export type ProtocolMessage =
  | FileChangedMessage
  | IntentModelMessage
  | FigmaOperationsMessage
  | ApplyOperationsMessage
  | ComposeOperationsMessage
  | OperationResultMessage
  | ComposeResultMessage
  | PluginReadyMessage
  | DesignChangeMessage
  | PingMessage
  | PongMessage
  | ErrorMessage
  | AckMessage;

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if a message is a specific type
 */
export function isMessageType<T extends MessageTypeValue>(
  msg: ProtocolMessage,
  type: T
): msg is Extract<ProtocolMessage, { type: T }> {
  return msg.type === type;
}

/**
 * Validate that a message has required fields
 */
export function isValidMessage(obj: unknown): obj is ProtocolMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as Record<string, unknown>;
  return (
    typeof msg['version'] === 'string' &&
    typeof msg['type'] === 'string' &&
    typeof msg['requestId'] === 'string' &&
    typeof msg['timestamp'] === 'string' &&
    'payload' in msg
  );
}

// =============================================================================
// DESIGN TOKEN UTILITIES
// =============================================================================

/**
 * Check if a value is a design token reference
 */
export function isDesignToken(value: unknown): value is DesignToken {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['path'] === 'string' && typeof obj['resolvedValue'] === 'string';
}

/**
 * Resolve a color value, handling both raw values and tokens
 */
export function resolveColor(value: DesignToken | string): string {
  if (typeof value === 'string') return value;
  return value.resolvedValue;
}
