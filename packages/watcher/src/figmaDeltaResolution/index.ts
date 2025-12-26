/**
 * @aesthetic-function/watcher - figmaDeltaResolution/index.ts
 *
 * Phase 12E: Guided Conflict Resolution & Resolution Plans.
 *
 * Public API for the resolution planning module.
 */

// Types
export type {
  ResolutionAction,
  ResolutionDecision,
  ResolutionPlan,
  ResolutionPlanSummary,
  ResolutionInput,
} from './types.js';

// Functions
export { generateResolutionPlan } from './generateResolutionPlan.js';
export {
  getResolutionArtifactPath,
  buildResolutionArtifact,
  writeResolutionArtifact,
} from './artifact.js';
