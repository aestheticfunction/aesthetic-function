/**
 * @aesthetic-function/watcher - figmaResolveApply/postApplyVerify.ts
 *
 * Phase 12H: Post-Apply Auto-Verification + CI Gate.
 *
 * WHY: Provides orchestration layer that automatically runs verification
 * after apply operations when explicitly enabled. This creates a seamless
 * apply → verify → exit-code pipeline for CI integration.
 *
 * SCOPE:
 * - Orchestration + policy only (no new mutation capabilities)
 * - Programmatic invocation of verification module
 * - Exit code semantics for CI gating
 * - Artifact linking (apply → verification)
 *
 * CONSTRAINTS:
 * - Does NOT add any mutation capability beyond Phase 12F
 * - Does NOT auto-enable anything
 * - Verification is opt-in via POST_APPLY_VERIFY=true
 * - Strict mode is default (exit 1 on mismatch/missing)
 */

import type { PostApplyVerifyConfig, PostApplyVerifyResult, ResolutionApplyArtifact } from './types.js';
import type { ResolutionPlan } from '../figmaDeltaResolution/types.js';
import type { VerificationContext, VerificationConfig } from '../verification/types.js';
import {
  verifyResolutionApply,
  verificationPassed,
} from '../verification/verify.js';
import {
  getVerificationArtifactPath,
  writeVerificationArtifact,
  getVerificationExitCode,
  shouldWriteArtifact,
} from '../verification/artifact.js';

// =============================================================================
// POST-APPLY VERIFICATION CONTEXT
// =============================================================================

/**
 * Context for running post-apply verification.
 */
export interface PostApplyVerifyContext {
  /**
   * Repository root path.
   */
  repoRoot: string;

  /**
   * Path to the apply artifact (for linking).
   */
  applyArtifactPath: string;

  /**
   * Loaded resolution plan (optional, for enhanced verification).
   */
  plan?: ResolutionPlan;

  /**
   * Server URL for Figma queries (if includeFigma is enabled).
   */
  serverUrl?: string;

  /**
   * Verification configuration (from Phase 12G).
   */
  verificationConfig?: VerificationConfig;
}

// =============================================================================
// POST-APPLY VERIFICATION ORCHESTRATION
// =============================================================================

/**
 * Run post-apply verification after a successful apply operation.
 *
 * This function orchestrates the verification flow:
 * 1. Build verification context from apply artifact
 * 2. Run verifyResolutionApply
 * 3. Write verification artifact (if applicable)
 * 4. Determine exit code based on strict mode
 *
 * @param applyArtifact - The apply artifact to verify
 * @param config - Post-apply verification configuration
 * @param context - Verification context
 * @returns Post-apply verification result with exit code
 */
export async function runPostApplyVerification(
  applyArtifact: ResolutionApplyArtifact,
  config: PostApplyVerifyConfig,
  context: PostApplyVerifyContext
): Promise<PostApplyVerifyResult> {
  // Build verification context
  const verifyContext: VerificationContext = {
    repoRoot: context.repoRoot,
    sourceFile: applyArtifact.sourceFile,
    includeFigma: config.includeFigma,
    serverUrl: context.serverUrl,
  };

  // Run verification
  const report = await verifyResolutionApply(applyArtifact, context.plan, verifyContext);

  // Determine if we should write artifact (always write for post-apply verification)
  const alwaysWrite = context.verificationConfig?.alwaysWriteArtifact ?? true;
  const shouldWrite = shouldWriteArtifact(report, alwaysWrite);

  // Write verification artifact
  let verificationArtifactPath: string | undefined;
  if (shouldWrite) {
    verificationArtifactPath = getVerificationArtifactPath(applyArtifact.sourceFile);
    await writeVerificationArtifact(report, context.repoRoot);
  }

  // Determine exit code
  const passed = verificationPassed(report);
  const exitCode = config.strict ? getVerificationExitCode(report) : 0;

  // Build summary (copy from report)
  const summary = report.summary;

  return {
    ran: true,
    passed,
    summary,
    verificationArtifactPath,
    exitCode,
  };
}

/**
 * Create a skipped verification result.
 *
 * @param skipReason - Reason verification was skipped
 * @returns Post-apply verification result indicating skip
 */
export function createSkippedVerificationResult(skipReason: string): PostApplyVerifyResult {
  return {
    ran: false,
    skipReason,
    exitCode: 0,
  };
}

/**
 * Format post-apply verification result for CLI output.
 *
 * @param result - Post-apply verification result
 * @returns Formatted string for CLI display
 */
export function formatPostApplyVerifyResult(result: PostApplyVerifyResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('POST-APPLY VERIFICATION');
  lines.push('=======================');

  if (!result.ran) {
    lines.push(`  Status: SKIPPED`);
    lines.push(`  Reason: ${result.skipReason}`);
    return lines.join('\n');
  }

  if (result.passed) {
    lines.push('  Status: PASSED ✓');
  } else {
    lines.push('  Status: FAILED ✗');
  }

  if (result.summary) {
    lines.push('');
    lines.push(`  ✓ Verified: ${result.summary.verified}`);
    lines.push(`  ⚠ Mismatch: ${result.summary.mismatch}`);
    lines.push(`  ✗ Missing:  ${result.summary.missing}`);
    lines.push(`  ⏭ Skipped:  ${result.summary.skipped}`);
    lines.push(`  ⊘ Blocked:  ${result.summary.blocked}`);
  }

  if (result.verificationArtifactPath) {
    lines.push('');
    lines.push(`  Artifact: ${result.verificationArtifactPath}`);
  }

  lines.push('');
  lines.push(`  Exit Code: ${result.exitCode}`);

  return lines.join('\n');
}

/**
 * Get the expected verification artifact path for an apply operation.
 *
 * Used to update the apply artifact with the verification path before writing.
 *
 * @param sourceFile - Source file path
 * @param repoRoot - Repository root
 * @returns Expected verification artifact path
 */
export function getExpectedVerificationPath(sourceFile: string): string {
  return getVerificationArtifactPath(sourceFile);
}
