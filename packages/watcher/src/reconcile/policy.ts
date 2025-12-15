/**
 * @aesthetic-function/watcher - reconcile/policy.ts
 *
 * Unified precedence policy for reconciling values across:
 * - JSX literals (AST-extracted semantics)
 * - @figma markers
 * - design-overrides.json
 * - AST materialization results
 *
 * WHY: Prevents "source-of-truth fights" by defining explicit precedence rules.
 * Each field value has a single source with clear provenance.
 *
 * PRECEDENCE RULES (MVP):
 * 1. If USE_OVERRIDES=true, overrides win per current precedence mode
 * 2. If overrides don't apply, prefer markers for explicitly declared fields
 * 3. If markers don't specify a field, fall back to AST literals
 * 4. Otherwise fall back to code-derived IntentModel
 */

import type { Intent, IntentModel } from '../transform/types.js';
import type { DesignOverrides } from './types.js';
import type { OverridePrecedence } from './config.js';
import { isOverrideNewerThanFile } from './config.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Source of a resolved value.
 */
export type ValueSource = 'override' | 'marker' | 'ast' | 'code';

/**
 * Resolution record for a single field.
 */
export interface FieldResolution {
  /** The chosen value */
  chosenValue: string | number | undefined;
  /** Source of the chosen value */
  source: ValueSource;
  /** Human-readable reason for the choice */
  reason: string;
  /** Whether this field was skipped/stale */
  skipped?: boolean;
}

/**
 * Resolution report for a single node.
 */
export interface NodeResolution {
  /** Node name */
  nodeName: string;
  /** Resolution for text field */
  text?: FieldResolution;
  /** Resolution for fill field */
  fill?: FieldResolution;
  /** Resolution for layout fields */
  layout?: {
    gap?: FieldResolution;
    padding?: FieldResolution;
    margin?: FieldResolution;
    width?: FieldResolution;
    height?: FieldResolution;
  };
}

/**
 * Summary of resolution results.
 */
export interface ResolutionSummary {
  /** Count of values from overrides */
  overrides: number;
  /** Count of values from markers */
  markers: number;
  /** Count of values from AST literals */
  ast: number;
  /** Count of values from code (fallback) */
  code: number;
  /** Count of skipped/stale fields */
  skipped: number;
}

/**
 * Complete resolution report.
 */
export interface ResolutionReport {
  /** Per-node resolution details */
  nodes: NodeResolution[];
  /** Summary counts */
  summary: ResolutionSummary;
}

/**
 * Resolved intent with value sources.
 * Uses intersection type since Intent is a union.
 */
export type ResolvedIntent = Intent & {
  /** Resolution metadata per field */
  _resolution?: {
    text?: FieldResolution;
    fill?: FieldResolution;
    layout?: Record<string, FieldResolution>;
  };
};

/**
 * Resolved IntentModel with resolution report.
 */
export interface ResolvedIntentModel {
  /** List of intent nodes to process */
  intents: ResolvedIntent[];
  /** Source identifier (e.g., file path, component name) */
  source?: string;
  /** Timestamp when intent was generated */
  timestamp?: string;
}

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Marker-derived intent values (from @figma comments).
 */
export interface MarkerIntent {
  nodeName: string;
  text?: string;
  fill?: string;
}

/**
 * AST-derived semantic values (from JSX literals).
 */
export interface AstSemantics {
  nodeName: string;
  /** Text literals found in component */
  textLiterals?: string[];
  /** Fill literals found in component (backgroundColor) */
  fillLiterals?: string[];
  /** Layout literals found in component */
  layoutLiterals?: {
    gap?: number | string;
    padding?: number | string;
    margin?: number | string;
    width?: number | string;
    height?: number | string;
  };
}

/**
 * Options for policy resolution.
 */
export interface PolicyOptions {
  /** Whether overrides are enabled */
  useOverrides: boolean;
  /** Override precedence mode */
  precedence: OverridePrecedence;
  /** File modification time (for if_newer_than_code) */
  fileMtime?: Date;
}

// =============================================================================
// POLICY RESOLUTION
// =============================================================================

/**
 * Resolve a single field value according to precedence policy.
 *
 * @param nodeName - Node name for logging
 * @param fieldName - Field name (text, fill, etc.)
 * @param override - Override value (if any)
 * @param overrideTimestamp - Override lastUpdated timestamp
 * @param markerValue - Marker value (if any)
 * @param astValue - AST literal value (if any)
 * @param codeValue - Code-derived value (fallback)
 * @param options - Policy options
 * @returns Field resolution with chosen value and source
 */
export function resolveField(
  nodeName: string,
  fieldName: string,
  override: string | number | undefined,
  overrideTimestamp: string | undefined,
  markerValue: string | number | undefined,
  astValue: string | number | undefined,
  codeValue: string | number | undefined,
  options: PolicyOptions
): FieldResolution {
  // 1. Check if overrides are enabled and apply
  if (options.useOverrides && override !== undefined) {
    // Check precedence for if_newer_than_code
    if (options.precedence === 'if_newer_than_code' && options.fileMtime) {
      if (!isOverrideNewerThanFile(overrideTimestamp, options.fileMtime)) {
        // Override is stale, skip it
        return resolveWithoutOverride(nodeName, fieldName, markerValue, astValue, codeValue, true);
      }
    }
    // Override wins
    return {
      chosenValue: override,
      source: 'override',
      reason: `Override ${fieldName}="${override}" applied (precedence=${options.precedence})`,
    };
  }

  // Fall through to resolve without override
  return resolveWithoutOverride(nodeName, fieldName, markerValue, astValue, codeValue, false);
}

/**
 * Resolve a field when override doesn't apply.
 */
function resolveWithoutOverride(
  _nodeName: string,
  fieldName: string,
  markerValue: string | number | undefined,
  astValue: string | number | undefined,
  codeValue: string | number | undefined,
  wasStale: boolean
): FieldResolution {
  // 2. Prefer marker if explicitly declared
  if (markerValue !== undefined) {
    return {
      chosenValue: markerValue,
      source: 'marker',
      reason: wasStale
        ? `Marker ${fieldName}="${markerValue}" used (override stale)`
        : `Marker ${fieldName}="${markerValue}" used (explicit declaration)`,
      skipped: wasStale,
    };
  }

  // 3. Fall back to AST literal
  if (astValue !== undefined) {
    return {
      chosenValue: astValue,
      source: 'ast',
      reason: wasStale
        ? `AST literal ${fieldName}="${astValue}" used (override stale, no marker)`
        : `AST literal ${fieldName}="${astValue}" used (no override, no marker)`,
      skipped: wasStale,
    };
  }

  // 4. Fall back to code-derived value
  return {
    chosenValue: codeValue,
    source: 'code',
    reason: wasStale
      ? `Code value ${fieldName}="${codeValue}" used (override stale, no marker, no AST)`
      : `Code value ${fieldName}="${codeValue}" used (no override, no marker, no AST)`,
    skipped: wasStale,
  };
}

/**
 * Resolve intents with full policy.
 *
 * @param baseModel - Base IntentModel from code parsing
 * @param markerIntents - Marker-derived intents
 * @param astSemantics - AST-derived semantics per node
 * @param overrides - Design overrides
 * @param options - Policy options
 * @returns Resolved model and resolution report
 */
export function resolveWithPolicy(
  baseModel: IntentModel,
  markerIntents: Map<string, MarkerIntent>,
  astSemantics: Map<string, AstSemantics>,
  overrides: DesignOverrides | null,
  options: PolicyOptions
): { model: ResolvedIntentModel; report: ResolutionReport } {
  const summary: ResolutionSummary = {
    overrides: 0,
    markers: 0,
    ast: 0,
    code: 0,
    skipped: 0,
  };

  const nodeResolutions: NodeResolution[] = [];

  const resolvedIntents = baseModel.intents.map((intent) => {
    const nodeName = intent.nodeName;
    const override = overrides?.[nodeName];
    const marker = markerIntents.get(nodeName);
    const ast = astSemantics.get(nodeName);

    const nodeResolution: NodeResolution = { nodeName };
    const intentResolution: ResolvedIntent['_resolution'] = {};

    // Resolve text field
    if (intent.type === 'TEXT' || intent.type === 'BUTTON') {
      const codeText = intent.type === 'TEXT' ? intent.characters : intent.text;
      const astText = ast?.textLiterals?.[0]; // Use first text literal

      const textRes = resolveField(
        nodeName,
        'text',
        override?.text,
        override?.lastUpdated,
        marker?.text,
        astText,
        codeText,
        options
      );

      nodeResolution.text = textRes;
      intentResolution.text = textRes;
      countSource(summary, textRes);

      // Apply resolved value to intent
      if (textRes.chosenValue !== undefined) {
        if (intent.type === 'TEXT') {
          (intent as typeof intent).characters = String(textRes.chosenValue);
        } else if (intent.type === 'BUTTON') {
          (intent as typeof intent).text = String(textRes.chosenValue);
        }
      }
    }

    // Resolve fill field
    if (intent.type === 'BUTTON' || intent.type === 'FRAME') {
      const codeFill = intent.fillTokenOrHex;
      const astFill = ast?.fillLiterals?.[0]; // Use first fill literal

      const fillRes = resolveField(
        nodeName,
        'fill',
        override?.fill,
        override?.lastUpdated,
        marker?.fill,
        astFill,
        codeFill,
        options
      );

      nodeResolution.fill = fillRes;
      intentResolution.fill = fillRes;
      countSource(summary, fillRes);

      // Apply resolved value to intent
      if (fillRes.chosenValue !== undefined) {
        (intent as typeof intent).fillTokenOrHex = String(fillRes.chosenValue);
      }
    } else if (intent.type === 'TEXT' && (override?.fill || marker?.fill || ast?.fillLiterals?.[0])) {
      // TEXT intents can have colorTokenOrHex
      const codeFill = intent.colorTokenOrHex;
      const astFill = ast?.fillLiterals?.[0];

      const fillRes = resolveField(
        nodeName,
        'fill',
        override?.fill,
        override?.lastUpdated,
        marker?.fill,
        astFill,
        codeFill,
        options
      );

      nodeResolution.fill = fillRes;
      intentResolution.fill = fillRes;
      countSource(summary, fillRes);

      if (fillRes.chosenValue !== undefined) {
        (intent as typeof intent).colorTokenOrHex = String(fillRes.chosenValue);
      }
    }

    // Resolve layout fields (for FRAME intents)
    if (intent.type === 'FRAME' && (override?.layout || ast?.layoutLiterals)) {
      nodeResolution.layout = {};
      intentResolution.layout = {};

      const layoutKeys = ['gap', 'padding', 'margin', 'width', 'height'] as const;
      for (const key of layoutKeys) {
        // Get code layout value (handle complex padding type)
        let codeLayout: number | string | undefined;
        if (key === 'gap') {
          codeLayout = intent.gap;
        } else if (key === 'padding') {
          // Padding can be number or object, only use if number
          codeLayout = typeof intent.padding === 'number' ? intent.padding : undefined;
        }
        const astLayout = ast?.layoutLiterals?.[key];
        const overrideLayout = override?.layout?.[key];

        if (overrideLayout !== undefined || astLayout !== undefined || codeLayout !== undefined) {
          const layoutRes = resolveField(
            nodeName,
            key,
            overrideLayout,
            override?.lastUpdated,
            undefined, // Markers don't currently have layout
            astLayout,
            codeLayout,
            options
          );

          nodeResolution.layout[key] = layoutRes;
          intentResolution.layout[key] = layoutRes;
          countSource(summary, layoutRes);

          // Apply to intent
          if (layoutRes.chosenValue !== undefined) {
            if (key === 'gap') {
              (intent as typeof intent).gap = Number(layoutRes.chosenValue);
            } else if (key === 'padding') {
              (intent as typeof intent).padding = Number(layoutRes.chosenValue);
            }
          }
        }
      }
    }

    nodeResolutions.push(nodeResolution);

    return {
      ...intent,
      _resolution: intentResolution,
    } as ResolvedIntent;
  });

  return {
    model: {
      source: baseModel.source,
      timestamp: baseModel.timestamp,
      intents: resolvedIntents,
    },
    report: {
      nodes: nodeResolutions,
      summary,
    },
  };
}

/**
 * Count source for summary.
 */
function countSource(summary: ResolutionSummary, resolution: FieldResolution): void {
  if (resolution.skipped) {
    summary.skipped++;
  }
  switch (resolution.source) {
    case 'override':
      summary.overrides++;
      break;
    case 'marker':
      summary.markers++;
      break;
    case 'ast':
      summary.ast++;
      break;
    case 'code':
      summary.code++;
      break;
  }
}

/**
 * Format resolution summary for logging.
 */
export function formatResolutionSummary(summary: ResolutionSummary): string {
  const parts: string[] = [];
  if (summary.overrides > 0) parts.push(`overrides=${summary.overrides}`);
  if (summary.markers > 0) parts.push(`markers=${summary.markers}`);
  if (summary.ast > 0) parts.push(`ast=${summary.ast}`);
  if (summary.code > 0) parts.push(`code=${summary.code}`);
  if (summary.skipped > 0) parts.push(`skipped=${summary.skipped}`);
  return `Resolved: ${parts.join(' ')}`;
}

/**
 * Log resolution summary.
 */
export function logResolutionSummary(
  report: ResolutionReport,
  prefix = '[Policy]'
): void {
  console.log(`${prefix} ${formatResolutionSummary(report.summary)}`);
}
