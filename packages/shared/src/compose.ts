/**
 * Compose operation types for Phase 11B.
 * Provides typed operations for controlled Figma composition.
 */

/**
 * Simple hash function for generating deterministic operation IDs.
 * Uses djb2 algorithm for platform-agnostic hashing.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Types of compose operations that can be applied to Figma.
 */
export type ComposeOpType =
  | 'ENSURE_COMPONENT_SET'
  | 'ENSURE_VARIANT'
  | 'ENSURE_PROPERTY_DEF';

/**
 * Payload for ENSURE_COMPONENT_SET operation.
 */
export interface EnsureComponentSetPayload {
  /** Component key from the component map */
  componentKey: string;
  /** Desired name for the Component Set in Figma */
  figmaName: string;
}

/**
 * Payload for ENSURE_VARIANT operation.
 */
export interface EnsureVariantPayload {
  /** Component key from the component map */
  componentKey: string;
  /** Parent Component Set name */
  componentSetName: string;
  /** Variant property values, e.g. { size: 'small', variant: 'filled' } */
  variantProps: Record<string, string>;
}

/**
 * Payload for ENSURE_PROPERTY_DEF operation.
 */
export interface EnsurePropertyDefPayload {
  /** Component key from the component map */
  componentKey: string;
  /** Property name to add */
  propertyName: string;
  /** Allowed values for the property */
  allowedValues: string[];
}

/**
 * Union of all compose operation payloads.
 */
export type ComposePayload =
  | EnsureComponentSetPayload
  | EnsureVariantPayload
  | EnsurePropertyDefPayload;

/**
 * A single compose operation.
 */
export interface ComposeOperation {
  /** Deterministic hash of operation parameters */
  opId: string;
  /** Type of operation */
  type: ComposeOpType;
  /** Source component key */
  componentKey: string;
  /** Target Figma name */
  figmaName: string;
  /** Operation-specific payload */
  payload: ComposePayload;
  /** Human-readable reason for the operation */
  reason: string;
  /** Source of the operation (e.g., 'figma-suggestions') */
  source: string;
}

/**
 * Result of a compose operation execution.
 */
export interface ComposeOperationResult {
  opId: string;
  success: boolean;
  /** Created/found node ID if applicable */
  nodeId?: string;
  /** Error message if failed */
  error?: string;
  /** Whether the node already existed */
  existed?: boolean;
}

/**
 * Compose artifact written to design-materializations/.
 */
export interface ComposeArtifact {
  version: '1.0';
  timestamp: string;
  source: 'figma-suggestions';
  mode: 'dry-run' | 'apply';
  operations: ComposeOperation[];
  /** Only present after apply */
  results?: ComposeOperationResult[];
}

/**
 * Generate a deterministic operation ID from operation parameters.
 * Uses djb2 hash of type + componentKey + figmaName + payload.
 */
export function generateOpId(
  type: ComposeOpType,
  componentKey: string,
  figmaName: string,
  payload: ComposePayload
): string {
  const content = JSON.stringify({ type, componentKey, figmaName, payload });
  return simpleHash(content);
}

/**
 * Create a ComposeOperation with a deterministic opId.
 */
export function createComposeOperation(
  type: ComposeOpType,
  componentKey: string,
  figmaName: string,
  payload: ComposePayload,
  reason: string,
  source: string = 'figma-suggestions'
): ComposeOperation {
  return {
    opId: generateOpId(type, componentKey, figmaName, payload),
    type,
    componentKey,
    figmaName,
    payload,
    reason,
    source,
  };
}
