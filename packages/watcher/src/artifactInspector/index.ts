/**
 * @aesthetic-function/watcher - artifactInspector/index.ts
 *
 * Phase 15D: Barrel exports for the artifact inspector module.
 */

export { listArtifacts, formatArtifactList } from './list.js';
export { detectArtifactType, inspectArtifact } from './inspect.js';
export { traceArtifacts, formatTrace } from './trace.js';
export type {
  ExtendedArtifactType,
  ArtifactListEntry,
  ArtifactListResult,
  RecognizedArtifact,
  InspectHighlight,
  HighlightLevel,
  InspectResult,
  TraceStep,
  TraceResult,
  ArtifactListCliOptions,
  ArtifactInspectCliOptions,
  ArtifactTraceCliOptions,
} from './types.js';
export {
  ARTIFACT_SUFFIX_MAP,
  ARTIFACT_PHASE_MAP,
  ARTIFACT_DISPLAY_NAMES,
} from './types.js';
