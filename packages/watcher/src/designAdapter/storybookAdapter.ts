/**
 * @aesthetic-function/watcher - designAdapter/storybookAdapter.ts
 *
 * Phase 16A Extension: Storybook Adapter (Stub Only).
 *
 * WHY: This minimal stub validates the Surface Classification Metadata model
 * by demonstrating how a runtime observation adapter (Storybook) would be
 * classified and registered. It reads component states from Storybook—in this
 * stub, via mock data—and returns structured props/variants.
 *
 * CRITICAL CONSTRAINTS:
 * - READ-ONLY. No mutation capability.
 * - No reconciliation logic. No runtime coupling.
 * - External and non-authoritative — AF does not treat Storybook data as canonical.
 * - This is a PLACEHOLDER. It is exported but NOT auto-registered.
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
// STORYBOOK ADAPTER (STUB)
// =============================================================================

/**
 * Storybook Adapter — stub implementation for model validation.
 *
 * Surface classification:
 * - surfaceType: "runtime" — Storybook is a component runtime/preview
 * - accessMode: "read-only" — AF only reads component state
 * - authorityRole: "external-non-authoritative" — Storybook data is informational
 * - stability: "observational" — point-in-time component snapshot
 */
export class StorybookAdapter implements DesignAdapter {
  readonly id = 'storybook';
  readonly displayName = 'Storybook Adapter';
  readonly version = '0.1.0';

  /** Surface classification: runtime, read-only, non-authoritative, observational */
  readonly surfaceMetadata: SurfaceMetadata = {
    surfaceType: 'runtime',
    accessMode: 'read-only',
    authorityRole: 'external-non-authoritative',
    stability: 'observational',
  };

  async isAvailable(): Promise<boolean> {
    // Stub: always unavailable unless Storybook integration is configured
    return false;
  }

  async getDesignTokens(): Promise<AdapterResult<DesignTokenValue[]>> {
    return this.emptyResult([]);
  }

  async getComponent(name: string): Promise<AdapterResult<DesignComponent | null>> {
    // Stub: return mock component data for validation
    const component: DesignComponent = {
      name,
      id: `storybook:${name}`,
      type: 'component',
      properties: {},
      variants: [],
    };
    return this.emptyResult(component);
  }

  async getComponents(): Promise<AdapterResult<DesignComponent[]>> {
    return this.emptyResult([]);
  }

  async getStyles(): Promise<AdapterResult<DesignStyle[]>> {
    return this.emptyResult([]);
  }

  async getFileData(): Promise<AdapterResult<DesignFileData>> {
    return this.emptyResult({
      name: 'Storybook',
      lastModified: new Date().toISOString(),
      pageCount: 0,
      componentCount: 0,
      styleCount: 0,
      variableCount: 0,
    });
  }

  async getScreenshot(): Promise<AdapterResult<DesignScreenshot | null>> {
    return this.emptyResult(null);
  }

  getCapabilities(): AdapterCapabilityManifest {
    return {
      readDesignTokens: false,
      readComponents: true,
      readStyles: false,
      readFileData: false,
      readScreenshots: false,
      readDesignSystemKit: false,
      readDesignCodeParity: false,

      // BLOCKED by AF architecture (non-negotiable)
      writeDesign: false,
      writeVariables: false,
      executeDesignCode: false,
      writeVariableCollections: false,
      cloudWriteRelay: false,
      writeFigJam: false,
      writeSlides: false,
    };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private emptyResult<T>(data: T): AdapterResult<T> {
    return {
      data,
      adapterId: this.id,
      adapterName: this.displayName,
      durationMs: 0,
      warnings: ['Storybook adapter is a stub — no real data'],
      cached: false,
    };
  }
}
