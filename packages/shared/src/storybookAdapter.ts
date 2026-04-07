/**
 * @aesthetic-function/shared - storybookAdapter.ts
 *
 * Phase 16C: Storybook MCP Adapter Types.
 *
 * WHY: The Storybook MCP adapter returns structured component metadata that
 * doesn't map 1:1 to the existing DesignAdapter interface (which was designed
 * for design tools like Figma). These types capture Storybook-specific data:
 * props with types/defaults, stories, variant axes, and docs linkage.
 *
 * CRITICAL CONSTRAINTS:
 * - These types are for READ-ONLY data extraction from Storybook.
 * - No mutation types. No write operations.
 * - Data flows: Storybook MCP → adapter → normalization → drift analysis.
 */

// =============================================================================
// STORYBOOK COMPONENT METADATA
// =============================================================================

/**
 * Metadata for a single component as extracted from Storybook's component manifest.
 *
 * This corresponds to the `ComponentManifest` type from @storybook/mcp,
 * normalized into AF's structure.
 */
export interface StorybookComponentMeta {
  /** Component name (e.g., "Button", "Card") */
  name: string;

  /** Component ID in Storybook manifest (e.g., "button") */
  id: string;

  /** Import path if available (e.g., "import { Button } from './Button'") */
  importPath?: string;

  /** Component description from JSDoc or docs */
  description?: string;

  /** Props with types, defaults, required status */
  props: StorybookProp[];

  /** Stories associated with this component */
  stories: StorybookStory[];

  /** Docs page reference if available */
  docsUrl?: string;
}

/**
 * A single prop extracted from Storybook's reactDocgen / argTypes.
 */
export interface StorybookProp {
  /** Prop name (e.g., "variant", "size", "onClick") */
  name: string;

  /**
   * Type string as reported by react-docgen.
   * May be a union (e.g., "'primary' | 'secondary' | 'ghost'"),
   * a primitive (e.g., "string", "boolean"), or complex (e.g., "ReactNode").
   */
  type: string;

  /** Default value as a string, if specified */
  defaultValue?: string;

  /** Whether this prop is required */
  required: boolean;

  /** Prop description from JSDoc */
  description?: string;
}

/**
 * A single Storybook story.
 */
export interface StorybookStory {
  /** Story ID in Storybook (e.g., "button--primary") */
  id: string;

  /** Story display name (e.g., "Primary") */
  name: string;

  /** Code snippet showing how the story uses the component */
  snippet?: string;

  /**
   * Variant dimensions this story encodes.
   * Inferred from story name + args matching prop names.
   * e.g., { variant: 'primary', size: 'large' }
   */
  variantAxes?: Record<string, string>;
}

// =============================================================================
// STORYBOOK INVENTORY
// =============================================================================

/**
 * Full inventory of components and stories from a Storybook instance.
 */
export interface StorybookInventory {
  /** All components discovered in Storybook */
  components: StorybookComponentMeta[];

  /** Total number of stories across all components */
  totalStories: number;

  /** Storybook version if detectable */
  storybookVersion?: string;

  /** Whether the manifest API was available (vs HTTP fallback) */
  manifestAvailable: boolean;
}

// =============================================================================
// STORYBOOK ADAPTER CONFIG
// =============================================================================

/**
 * Configuration for the Storybook MCP Adapter.
 */
export interface StorybookMCPConfig {
  /** URL of the Storybook dev server (e.g., http://localhost:6006) */
  url: string;

  /** MCP endpoint path (default: '/mcp') */
  mcpPath?: string;

  /** Request timeout in ms (default: 30000) */
  timeout?: number;

  /** Expected framework. Adapter validates at startup. Default: 'react' */
  framework?: 'react';
}

// =============================================================================
// OPERATING MODE
// =============================================================================

/**
 * The adapter's current operating mode.
 *
 * - 'mcp': Connected to @storybook/addon-mcp via MCP protocol
 * - 'http-fallback': MCP unavailable, using direct HTTP to manifest endpoints
 * - 'unavailable': Storybook dev server not reachable or framework mismatch
 */
export type StorybookOperatingMode = 'mcp' | 'http-fallback' | 'unavailable';
