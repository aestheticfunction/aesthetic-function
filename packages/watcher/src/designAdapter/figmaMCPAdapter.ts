/**
 * @aesthetic-function/watcher - designAdapter/figmaMCPAdapter.ts
 *
 * Phase 16A: Figma MCP Adapter (Read-Only Stub).
 *
 * WHY: This adapter reads design system data via MCP-compatible tools
 * (e.g., figma-console-mcp). It provides design tokens, component specs,
 * and file metadata to enrich verification and delta detection.
 *
 * CRITICAL CONSTRAINTS:
 * - READ-ONLY. No write operations. No mutations.
 * - Does not bypass watcher → server → plugin.
 * - Does not own reconciliation or policy.
 * - If unavailable, the system works fully without it.
 *
 * CURRENT STATE: Stub implementation with realistic mock data.
 * Phase 16B will wire this to an actual MCP transport.
 */

import type {
  DesignAdapter,
  AdapterResult,
  AdapterCapabilityManifest,
  DesignTokenValue,
  DesignComponent,
  DesignStyle,
  DesignFileData,
  DesignScreenshot,
} from '@aesthetic-function/shared/designAdapter';
import type { SurfaceMetadata } from '@aesthetic-function/shared/surfaceMetadata';

// =============================================================================
// MOCK DATA
// =============================================================================

/**
 * Realistic mock tokens matching a typical Figma Variables setup.
 * These mirror the design tokens already used in AF's designTokens.ts.
 */
const MOCK_TOKENS: DesignTokenValue[] = [
  // Colors
  { name: 'colors/primary/500', value: '#3B82F6', type: 'color', description: 'Primary brand color' },
  { name: 'colors/primary/600', value: '#2563EB', type: 'color', description: 'Primary hover' },
  { name: 'colors/primary/700', value: '#1D4ED8', type: 'color', description: 'Primary pressed' },
  { name: 'colors/secondary/500', value: '#8B5CF6', type: 'color', description: 'Secondary brand' },
  { name: 'colors/success/500', value: '#10B981', type: 'color', description: 'Success state' },
  { name: 'colors/warning/500', value: '#F59E0B', type: 'color', description: 'Warning state' },
  { name: 'colors/error/500', value: '#EF4444', type: 'color', description: 'Error state' },
  { name: 'colors/neutral/50', value: '#F9FAFB', type: 'color', description: 'Lightest neutral' },
  { name: 'colors/neutral/100', value: '#F3F4F6', type: 'color' },
  { name: 'colors/neutral/500', value: '#6B7280', type: 'color' },
  { name: 'colors/neutral/900', value: '#111827', type: 'color', description: 'Darkest neutral' },

  // Spacing
  { name: 'spacing/none', value: '0', type: 'spacing' },
  { name: 'spacing/xs', value: '4', type: 'spacing' },
  { name: 'spacing/sm', value: '8', type: 'spacing' },
  { name: 'spacing/md', value: '16', type: 'spacing' },
  { name: 'spacing/lg', value: '24', type: 'spacing' },
  { name: 'spacing/xl', value: '32', type: 'spacing' },

  // Radius
  { name: 'radius/none', value: '0', type: 'radius' },
  { name: 'radius/sm', value: '4', type: 'radius' },
  { name: 'radius/md', value: '8', type: 'radius' },
  { name: 'radius/lg', value: '16', type: 'radius' },

  // Typography
  { name: 'typography/fontSize/sm', value: '14', type: 'typography', description: 'Small body text' },
  { name: 'typography/fontSize/md', value: '16', type: 'typography', description: 'Default body' },
  { name: 'typography/fontSize/lg', value: '20', type: 'typography', description: 'Large text' },
  { name: 'typography/fontWeight/normal', value: '400', type: 'typography' },
  { name: 'typography/fontWeight/medium', value: '500', type: 'typography' },
  { name: 'typography/fontWeight/bold', value: '700', type: 'typography' },
];

const MOCK_COMPONENTS: DesignComponent[] = [
  {
    name: 'Button',
    id: '1:100',
    type: 'component-set',
    properties: {
      fills: [{ type: 'SOLID', color: { r: 0.231, g: 0.510, b: 0.965 } }],
      cornerRadius: 8,
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
      itemSpacing: 8,
    },
    variants: [
      { name: 'Default', id: '1:101', properties: { State: 'base' } },
      { name: 'Hover', id: '1:102', properties: { State: 'hover' } },
      { name: 'Pressed', id: '1:103', properties: { State: 'pressed' } },
      { name: 'Disabled', id: '1:104', properties: { State: 'disabled' } },
    ],
  },
  {
    name: 'Card',
    id: '1:200',
    type: 'component',
    properties: {
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      cornerRadius: 12,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      itemSpacing: 12,
      width: 320,
      height: 200,
    },
  },
  {
    name: 'TextInput',
    id: '1:300',
    type: 'component',
    properties: {
      fills: [{ type: 'SOLID', color: { r: 0.976, g: 0.980, b: 0.984 } }],
      cornerRadius: 6,
      paddingTop: 8,
      paddingRight: 12,
      paddingBottom: 8,
      paddingLeft: 12,
      fontSize: 14,
      fontWeight: 400,
    },
  },
];

const MOCK_STYLES: DesignStyle[] = [
  { name: 'Primary/Fill', id: 's:1', type: 'fill', properties: { color: '#3B82F6' } },
  { name: 'Surface/Background', id: 's:2', type: 'fill', properties: { color: '#FFFFFF' } },
  { name: 'Text/Heading', id: 's:3', type: 'text', properties: { fontSize: 24, fontWeight: 700, lineHeight: 32 } },
  { name: 'Text/Body', id: 's:4', type: 'text', properties: { fontSize: 16, fontWeight: 400, lineHeight: 24 } },
  { name: 'Shadow/Card', id: 's:5', type: 'effect', properties: { blur: 8, offsetY: 2, color: '#0000001A' } },
];

// =============================================================================
// ADAPTER IMPLEMENTATION
// =============================================================================

/**
 * Figma MCP Adapter — read-only stub.
 *
 * In Phase 16B, this will be wired to an actual MCP transport
 * (e.g., figma-console-mcp via @modelcontextprotocol/sdk).
 * For now, it returns realistic mock data to validate the interface,
 * normalization layer, and CLI integration.
 */
export class FigmaMCPAdapter implements DesignAdapter {
  readonly id = 'figma-mcp';
  readonly displayName = 'Figma MCP Adapter';
  readonly version = '0.1.0';

  /** Surface classification: design tool, read-only, non-authoritative, observational */
  readonly surfaceMetadata: SurfaceMetadata = {
    surfaceType: 'design',
    accessMode: 'read-only',
    authorityRole: 'external-non-authoritative',
    stability: 'observational',
  };

  /** Whether this stub is configured to be "available" */
  private available: boolean;

  constructor(options?: { available?: boolean }) {
    this.available = options?.available ?? true;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async getDesignTokens(): Promise<AdapterResult<DesignTokenValue[]>> {
    const start = Date.now();
    // In production: MCP call to figma_get_variables or similar
    return {
      data: MOCK_TOKENS,
      adapterId: this.id,
      adapterName: this.displayName,
      durationMs: Date.now() - start,
      warnings: [],
      cached: false,
    };
  }

  async getComponent(name: string): Promise<AdapterResult<DesignComponent | null>> {
    const start = Date.now();
    const component = MOCK_COMPONENTS.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    ) ?? null;

    return {
      data: component,
      adapterId: this.id,
      adapterName: this.displayName,
      durationMs: Date.now() - start,
      warnings: component ? [] : [`Component "${name}" not found`],
      cached: false,
    };
  }

  async getComponents(): Promise<AdapterResult<DesignComponent[]>> {
    const start = Date.now();
    return {
      data: MOCK_COMPONENTS,
      adapterId: this.id,
      adapterName: this.displayName,
      durationMs: Date.now() - start,
      warnings: [],
      cached: false,
    };
  }

  async getStyles(): Promise<AdapterResult<DesignStyle[]>> {
    const start = Date.now();
    return {
      data: MOCK_STYLES,
      adapterId: this.id,
      adapterName: this.displayName,
      durationMs: Date.now() - start,
      warnings: [],
      cached: false,
    };
  }

  async getFileData(): Promise<AdapterResult<DesignFileData>> {
    const start = Date.now();
    return {
      data: {
        name: 'Aesthetic Function Design System',
        lastModified: new Date().toISOString(),
        pageCount: 3,
        componentCount: MOCK_COMPONENTS.length,
        styleCount: MOCK_STYLES.length,
        variableCount: MOCK_TOKENS.length,
        meta: {
          version: 'stub',
          transport: 'mock',
        },
      },
      adapterId: this.id,
      adapterName: this.displayName,
      durationMs: Date.now() - start,
      warnings: ['Using stub data — wire MCP transport in Phase 16B'],
      cached: false,
    };
  }

  async getScreenshot(): Promise<AdapterResult<DesignScreenshot | null>> {
    return {
      data: null,
      adapterId: this.id,
      adapterName: this.displayName,
      durationMs: 0,
      warnings: ['Screenshots not available in stub adapter'],
      cached: false,
    };
  }

  getCapabilities(): AdapterCapabilityManifest {
    return {
      // Allowed (read-only)
      readDesignTokens: true,
      readComponents: true,
      readStyles: true,
      readFileData: true,
      readScreenshots: false, // stub does not support screenshots
      readDesignSystemKit: false,
      readDesignCodeParity: false,

      // Blocked by AF architecture
      writeDesign: false,
      writeVariables: false,
      executeDesignCode: false,
      writeVariableCollections: false,
      cloudWriteRelay: false,
      writeFigJam: false,
      writeSlides: false,
    };
  }
}
