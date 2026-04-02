/**
 * @aesthetic-function/shared - designAdapter.ts
 *
 * Phase 16A: Design Adapter Interface (Read-Only).
 *
 * WHY: External design systems (Figma MCP, Builder.io, Stitch, etc.) can provide
 * design intelligence — tokens, component specs, style data — that enriches
 * verification and delta detection. This interface defines the READ-ONLY contract
 * that all adapters must implement.
 *
 * CRITICAL CONSTRAINTS:
 * - All methods are READ-ONLY. No write methods exist.
 * - Adapters must NOT create, modify, or delete design elements.
 * - Adapters must NOT bypass watcher → server → plugin authority.
 * - Adapter output is normalized before entering the watcher pipeline.
 * - AF remains the sole authority for mutations.
 */

// =============================================================================
// DESIGN TOKEN TYPES (adapter-neutral)
// =============================================================================

/**
 * A design token as read from an external design system.
 * Raw format — must be normalized to canonical tokens before use.
 */
export interface DesignTokenValue {
  /** Token name/path in the design system (e.g., "colors/primary/500") */
  name: string;

  /** Resolved value (hex color, pixel number, font family, etc.) */
  value: string;

  /** Token type for categorization */
  type: 'color' | 'spacing' | 'radius' | 'typography' | 'opacity' | 'other';

  /** Optional description from the design system */
  description?: string;

  /** Whether this is an alias/reference to another token */
  aliasOf?: string;
}

/**
 * A design component as read from an external design system.
 */
export interface DesignComponent {
  /** Component name in the design system */
  name: string;

  /** Unique identifier in the design tool (e.g., Figma node ID) */
  id: string;

  /** Component type classification */
  type: 'component' | 'component-set' | 'instance' | 'frame';

  /** Key-value properties (fills, text, layout, etc.) */
  properties: Record<string, unknown>;

  /** Variant properties if this is a component set */
  variants?: DesignVariant[];

  /** Child components */
  children?: DesignComponent[];
}

/**
 * A variant within a component set.
 */
export interface DesignVariant {
  /** Variant name or property combination */
  name: string;

  /** Node ID in the design tool */
  id: string;

  /** Property key-value pairs that define this variant */
  properties: Record<string, string>;
}

/**
 * A style definition from the design system.
 */
export interface DesignStyle {
  /** Style name (e.g., "Heading/H1", "Body/Default") */
  name: string;

  /** Unique identifier */
  id: string;

  /** Style category */
  type: 'fill' | 'text' | 'effect' | 'grid';

  /** Resolved style properties */
  properties: Record<string, unknown>;
}

/**
 * File-level metadata from the design system.
 */
export interface DesignFileData {
  /** File name */
  name: string;

  /** Last modified timestamp (ISO 8601) */
  lastModified: string;

  /** Number of pages */
  pageCount: number;

  /** Number of components */
  componentCount: number;

  /** Number of styles */
  styleCount: number;

  /** Number of variables/tokens */
  variableCount: number;

  /** Additional metadata from the adapter */
  meta?: Record<string, unknown>;
}

// =============================================================================
// SCREENSHOT TYPES
// =============================================================================

/**
 * A screenshot captured from the design tool.
 */
export interface DesignScreenshot {
  /** Base64-encoded image data */
  data: string;

  /** Image format */
  format: 'png' | 'jpg' | 'svg';

  /** Image dimensions in pixels */
  width?: number;
  height?: number;

  /** What was captured (node name, page name, etc.) */
  subject?: string;

  /** Timestamp of capture */
  capturedAt: string;
}

// =============================================================================
// ADAPTER CAPABILITY MANIFEST
// =============================================================================

/**
 * Explicit capability manifest for a design adapter.
 *
 * WHY: External tools like figma-console-mcp expose broad capabilities
 * including design creation, variable management, and code execution.
 * AF intentionally restricts adapters to read-only operations.
 * The manifest makes allowed/blocked capabilities explicit and auditable.
 *
 * RULE: Every `false` capability is an intentional architectural decision,
 * not an omission. AF's mutation path is watcher → server → plugin ONLY.
 */
export interface AdapterCapabilityManifest {
  // --- ALLOWED (read-only intelligence) ---

  /** Read design tokens / variables */
  readDesignTokens: boolean;

  /** Read component definitions and properties */
  readComponents: boolean;

  /** Read published styles (fill, text, effect, grid) */
  readStyles: boolean;

  /** Read file-level metadata and structure */
  readFileData: boolean;

  /** Capture visual screenshots of design content */
  readScreenshots: boolean;

  /** Read design system kit (tokens + components + styles in one call) */
  readDesignSystemKit: boolean;

  /** Read design-code parity reports */
  readDesignCodeParity: boolean;

  // --- BLOCKED (mutation via AF architecture) ---
  // These are intentionally false. They are not "not yet implemented" —
  // they are "blocked by AF's deterministic reconciliation model."

  /** Create or edit design elements — BLOCKED: AF plugin is sole mutator */
  writeDesign: false;

  /** Create, update, or delete variables — BLOCKED: AF owns token authority */
  writeVariables: false;

  /** Execute arbitrary Figma Plugin API code — BLOCKED: security + control */
  executeDesignCode: false;

  /** Manage variable collections (create/delete) — BLOCKED */
  writeVariableCollections: false;

  /** Cloud relay write pairing — BLOCKED: AF has its own relay (server) */
  cloudWriteRelay: false;

  /** FigJam board creation/modification — BLOCKED: outside AF scope */
  writeFigJam: false;

  /** Slides creation/modification — BLOCKED: outside AF scope */
  writeSlides: false;
}

// =============================================================================
// ADAPTER RESULT TYPES
// =============================================================================

/**
 * Result wrapper for all adapter operations.
 * Includes provenance and timing for observability.
 */
export interface AdapterResult<T> {
  /** The data returned by the adapter */
  data: T;

  /** Which adapter produced this result */
  adapterId: string;

  /** Adapter display name */
  adapterName: string;

  /** Time taken in milliseconds */
  durationMs: number;

  /** Any warnings or notes from the extraction */
  warnings: string[];

  /** Whether this is cached data */
  cached: boolean;
}

// =============================================================================
// DESIGN ADAPTER INTERFACE (READ-ONLY)
// =============================================================================

/**
 * Read-only interface for external design system adapters.
 *
 * All methods read data from the design system. None of them write.
 * This is the contract that Phase 16B+ adapters (Figma MCP, etc.) implement.
 *
 * INVARIANT: No method on this interface creates, modifies, or deletes
 * design elements. AF's watcher → server → plugin path is the sole write path.
 */
export interface DesignAdapter {
  /** Unique identifier for this adapter (e.g., "figma-mcp", "builder-io") */
  readonly id: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Adapter version */
  readonly version: string;

  /**
   * Surface classification metadata (Phase 16A Extension).
   *
   * Categorizes the external surface this adapter connects to along
   * four independent dimensions. This is a read-only descriptor that
   * does NOT influence reconciliation, execution order, or adapter behavior.
   *
   * Optional for backward compatibility.
   */
  readonly surfaceMetadata?: import('./surfaceMetadata.js').SurfaceMetadata;

  /**
   * Check if the adapter is available and configured.
   * Returns true if the adapter can make requests.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get all design tokens (variables) from the design system.
   * Returns raw token values that must be normalized to canonical tokens.
   */
  getDesignTokens(): Promise<AdapterResult<DesignTokenValue[]>>;

  /**
   * Get a specific component by name.
   * Returns the component with its properties and variants.
   */
  getComponent(name: string): Promise<AdapterResult<DesignComponent | null>>;

  /**
   * Get all published components from the design system.
   */
  getComponents(): Promise<AdapterResult<DesignComponent[]>>;

  /**
   * Get all published styles (fill, text, effect, grid).
   */
  getStyles(): Promise<AdapterResult<DesignStyle[]>>;

  /**
   * Get file-level metadata.
   */
  getFileData(): Promise<AdapterResult<DesignFileData>>;

  /**
   * Capture a screenshot of the current design or a specific node.
   * Optional — adapters that don't support screenshots return null.
   *
   * @param nodeId - Optional node ID to screenshot. If omitted, captures current view.
   */
  getScreenshot?(nodeId?: string): Promise<AdapterResult<DesignScreenshot | null>>;

  /**
   * Return the capability manifest for this adapter.
   * Used for observability, auditing, and enforcing AF's read-only boundary.
   */
  getCapabilities(): AdapterCapabilityManifest;
}
