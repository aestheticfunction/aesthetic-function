/**
 * @aesthetic-function/watcher - orchestrator/featureFromPrompt.ts
 *
 * Feature Orchestrator: Prompt → Code → Figma flow.
 *
 * WHY: Phase 9A introduces AI-assisted feature development. This module:
 * 1. Gathers context from existing infrastructure (AST, IntentModel, overrides, etc.)
 * 2. Constructs a context bundle for the LLM
 * 3. Sends to the LLM and receives a patch artifact
 * 4. Saves the artifact for review
 * 5. Optionally applies the patch to code
 *
 * SAFETY:
 * - No blind writes: everything is gated and reviewable
 * - LLM can only propose changes to auto-writable values
 * - Artifact must be saved before any application
 * - Application is opt-in (AST_WRITE_MODE=write required)
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, basename, relative, resolve } from 'node:path';
import { access } from 'node:fs/promises';

import type {
  FeatureRequest,
  FeatureOptions,
  FeatureResult,
  ContextBundle,
  PromptPatchArtifact,
  ComponentState,
  TokenInfo,
} from './types.js';
import { FEATURE_ORCHESTRATOR_SYSTEM_PROMPT, buildUserPrompt } from './systemPrompt.js';
import { anchorMarkersToAst, parseIntentFromReactAst } from '../ast/parseIntentFromReactAst.js';
import { analyzeWriteFeasibility } from '../ast/analyzeFeasibility.js';
import { loadDesignOverrides } from '../reconcile/loadDesignOverrides.js';
import { loadComponentMap } from '../reconcile/componentMap.js';
import type { DesignOverrides } from '../reconcile/types.js';
import { parseIntentFromReact } from '../parse/parseIntentFromReact.js';
import { getDefaultTokenContext } from '../tokens/designTokens.js';
import { getLLMProvider, getLLMApiKey, getLLMModel } from '../analyze/analyzeCodeWithLLM.js';
import { AST_MATERIALIZATIONS_DIR } from '../materialize/materializeAstPatch.js';
import { materializeAstWrite, type AstWriteOptions } from '../materialize/materializeAstWrite.js';
import { logAstWriteResult } from '../materialize/index.js';
import { getAstWriteMode } from '../materialize/config.js';
import type { LayoutOverride } from '../reconcile/types.js';
import {
  applyStateAware,
  filterJsxChanges,
} from './stateAwareApply.js';
import {
  postApplyEmitDebounced,
  isPostApplyEmitEnabled,
  type PostApplyEmitResult,
} from './postApplyEmit.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Suffix for prompt-generated patch artifacts */
const PROMPT_PATCH_SUFFIX = '.prompt-patch.json';

// =============================================================================
// LLM CALL HELPERS
// =============================================================================

/**
 * Call OpenAI API with system and user messages.
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Call Anthropic API with system and user messages.
 */
async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json() as { content?: { type: string; text?: string }[] };
  const textContent = data.content?.find((c) => c.type === 'text')?.text ?? '';
  return textContent;
}

/**
 * Call the configured LLM provider.
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  provider: 'openai' | 'anthropic',
  apiKey: string,
  model: string
): Promise<string> {
  if (provider === 'anthropic') {
    return callAnthropic(systemPrompt, userPrompt, apiKey, model);
  }
  return callOpenAI(systemPrompt, userPrompt, apiKey, model);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize a file path to relative format for artifact naming.
 */
function normalizePathForArtifact(filePath: string, repoRoot: string): string {
  const relativePath = relative(repoRoot, filePath);
  return relativePath.replace(/[/\\]/g, '__').replace(/\.[^.]+$/, '');
}

/**
 * Get the artifact path for a prompt patch.
 */
export function getPromptPatchArtifactPath(filePath: string, repoRoot: string): string {
  const safeName = normalizePathForArtifact(filePath, repoRoot);
  return join(repoRoot, AST_MATERIALIZATIONS_DIR, `${safeName}${PROMPT_PATCH_SUFFIX}`);
}

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert design tokens to simplified format for LLM context.
 */
function tokensToInfo(tokenContext: ReturnType<typeof getDefaultTokenContext>): TokenInfo[] {
  const tokens: TokenInfo[] = [];
  for (const [name, token] of tokenContext.tokens) {
    tokens.push({ name, value: token.value });
  }
  return tokens;
}

/**
 * Infer component key from AST report.
 *
 * Finds the first exported component with a @figma marker.
 */
function inferComponentKey(
  anchoredReport: ReturnType<typeof anchorMarkersToAst>
): string | undefined {
  for (const anchor of anchoredReport.anchors) {
    if (anchor.componentKey) {
      return anchor.componentKey;
    }
    if (anchor.componentName) {
      return anchor.componentName;
    }
  }
  return undefined;
}

/**
 * Parse LLM response to extract JSON.
 *
 * Handles responses that may include markdown code blocks.
 */
function parseLLMResponse(response: string): PromptPatchArtifact {
  // Try to extract JSON from code blocks if present
  let jsonStr = response.trim();
  
  // Remove markdown code blocks if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr) as PromptPatchArtifact;
  } catch (err) {
    throw new Error(
      `Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : String(err)}\n\nResponse:\n${response.slice(0, 500)}`
    );
  }
}

/**
 * Validate the patch artifact structure.
 */
function validatePatchArtifact(artifact: unknown, expectedFile: string): PromptPatchArtifact {
  if (!artifact || typeof artifact !== 'object') {
    throw new Error('LLM response is not a valid object');
  }

  const a = artifact as Record<string, unknown>;

  // Required fields
  if (typeof a.file !== 'string') {
    throw new Error('Artifact missing "file" field');
  }
  if (typeof a.generatedAt !== 'string') {
    throw new Error('Artifact missing "generatedAt" field');
  }
  if (!Array.isArray(a.changes)) {
    throw new Error('Artifact missing "changes" array');
  }

  // File must match
  if (!a.file.includes(basename(expectedFile)) && !expectedFile.includes(a.file)) {
    console.warn(
      `[Orchestrator] Warning: artifact file "${a.file}" doesn't match expected "${expectedFile}"`
    );
  }

  // Validate each change
  for (const change of a.changes) {
    if (typeof change !== 'object' || !change) {
      throw new Error('Invalid change entry in artifact');
    }
    const c = change as Record<string, unknown>;
    if (!['SET_TEXT', 'SET_FILL', 'SET_LAYOUT'].includes(c.op as string)) {
      throw new Error(`Invalid operation type: ${c.op}`);
    }
    if (typeof c.nodeName !== 'string') {
      throw new Error('Change missing "nodeName" field');
    }
    if (typeof c.reason !== 'string') {
      throw new Error('Change missing "reason" field');
    }
  }

  return artifact as PromptPatchArtifact;
}

// =============================================================================
// MAIN ORCHESTRATOR FUNCTION
// =============================================================================

/**
 * Feature Orchestrator: Generate a code patch from a natural language prompt.
 *
 * This function:
 * 1. Gathers context from the target file (AST, intents, overrides, etc.)
 * 2. Constructs a context bundle for the LLM
 * 3. Sends the bundle to the LLM and receives a patch artifact
 * 4. Validates and saves the artifact
 * 5. Optionally applies the patch if requested
 *
 * @param request - Feature request with prompt and target info
 * @param options - Orchestrator options
 * @returns Feature result with artifact and status
 */
export async function featureFromPrompt(
  request: FeatureRequest,
  options: FeatureOptions
): Promise<FeatureResult> {
  const { prompt, targetFile, targetComponentKey, state = 'base' } = request;
  const { repoRoot, apply = false, dryRun = true } = options;

  console.log(`[Orchestrator] Processing feature request for ${targetFile}`);
  console.log(`[Orchestrator] Prompt: "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

  // Resolve file paths
  const absolutePath = resolve(repoRoot, targetFile);
  const relativePath = relative(repoRoot, absolutePath);

  // Check file exists
  if (!(await fileExists(absolutePath))) {
    throw new Error(`Target file not found: ${absolutePath}`);
  }

  // Read file content
  const content = await readFile(absolutePath, 'utf-8');

  // ==========================================================================
  // GATHER CONTEXT
  // ==========================================================================

  console.log('[Orchestrator] Gathering context...');

  // 1. Parse AST and anchor markers
  const astReport = parseIntentFromReactAst(content, relativePath);
  const anchoredReport = anchorMarkersToAst(content, relativePath, astReport);

  // 2. Infer component key if not provided
  const componentKey = targetComponentKey ?? inferComponentKey(anchoredReport) ?? 'Unknown';
  console.log(`[Orchestrator] Component key: ${componentKey}`);

  // 3. Parse intent model (marker-based)
  const intentModel = parseIntentFromReact(content, relativePath);

  // 4. Load design overrides
  const loadedOverrides = await loadDesignOverrides();
  const designOverrides = loadedOverrides ?? {} as DesignOverrides;

  // 5. Load component map
  const componentMap = await loadComponentMap();

  // 6. Analyze write feasibility
  const writeFeasibility = analyzeWriteFeasibility(content, relativePath);

  // 7. Get design tokens
  const tokenContext = getDefaultTokenContext();
  const designTokens = tokensToInfo(tokenContext);

  // ==========================================================================
  // BUILD CONTEXT BUNDLE
  // ==========================================================================

  const contextBundle: ContextBundle = {
    featurePrompt: prompt,
    file: relativePath,
    componentKey,
    state: state as ComponentState,
    astReport: anchoredReport,
    intentModel,
    designOverrides,
    componentMap,
    writeFeasibility,
    designTokens,
  };

  console.log('[Orchestrator] Context bundle prepared');
  console.log(`[Orchestrator] - Components: ${astReport.components.length}`);
  console.log(`[Orchestrator] - Anchors: ${anchoredReport.anchors.length}`);
  console.log(`[Orchestrator] - Intents: ${intentModel.intents.length}`);
  console.log(`[Orchestrator] - Design tokens: ${designTokens.length}`);

  // ==========================================================================
  // CALL LLM
  // ==========================================================================

  console.log('[Orchestrator] Calling LLM...');

  const provider = options.llmProvider ?? getLLMProvider();
  const apiKey = getLLMApiKey();
  const model = getLLMModel();

  if (!apiKey) {
    throw new Error(
      `No API key found for ${provider}. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} environment variable.`
    );
  }

  const userPrompt = buildUserPrompt(JSON.stringify(contextBundle, null, 2));

  const llmResponse = await callLLM(
    FEATURE_ORCHESTRATOR_SYSTEM_PROMPT,
    userPrompt,
    provider,
    apiKey,
    model
  );

  console.log('[Orchestrator] LLM response received');

  // ==========================================================================
  // PARSE AND VALIDATE ARTIFACT
  // ==========================================================================

  const rawArtifact = parseLLMResponse(llmResponse);
  const artifact = validatePatchArtifact(rawArtifact, relativePath);

  // Ensure required fields are set
  if (!artifact.prompt) {
    artifact.prompt = prompt;
  }
  if (!artifact.componentKey) {
    artifact.componentKey = componentKey;
  }
  if (!artifact.state) {
    artifact.state = state as ComponentState;
  }
  if (!artifact.skipped) {
    artifact.skipped = [];
  }

  console.log(`[Orchestrator] Artifact validated: ${artifact.changes.length} changes, ${artifact.skipped.length} skipped`);

  // ==========================================================================
  // SAVE ARTIFACT
  // ==========================================================================

  const artifactPath = getPromptPatchArtifactPath(absolutePath, repoRoot);
  const artifactDir = dirname(artifactPath);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2) + '\n', 'utf-8');

  console.log(`[Orchestrator] Artifact saved: ${artifactPath}`);

  // ==========================================================================
  // APPLY PATCH (OPTIONAL) - STATE-AWARE
  // ==========================================================================

  let applied = false;

  if (apply && artifact.changes.length > 0) {
    const astWriteMode = getAstWriteMode();
    
    console.log('[Orchestrator] Applying patch (state-aware)...');
    console.log(`[Orchestrator]   Target state: ${state}`);
    console.log(`[Orchestrator]   AST_WRITE_MODE=${astWriteMode}`);
    console.log(`[Orchestrator]   dryRun=${dryRun}`);

    // Check if write mode is enabled
    if (astWriteMode !== 'write') {
      console.log('[Orchestrator] Skipped: AST_WRITE_MODE is not "write"');
      console.log('[Orchestrator] To apply changes, set AST_WRITE_MODE=write');
    } else {
      // =======================================================================
      // STATE-AWARE ROUTING
      // =======================================================================
      // For non-base states (hover, pressed, disabled):
      // - Route changes to markers or overrides (NOT base JSX)
      // For base state:
      // - Route changes to JSX literals
      // =======================================================================

      // Apply state-aware changes (markers and overrides)
      const { result: stateResult, updatedContent: markerContent } = await applyStateAware(
        artifact,
        content,
        repoRoot,
        dryRun
      );

      // Log state-aware apply details
      console.log('[Orchestrator] State-aware apply results:');
      for (const logLine of stateResult.log) {
        console.log(`[Orchestrator]   ${logLine}`);
      }

      // Get changes that should go to JSX (base state only, or explicit state branches)
      const jsxChanges = filterJsxChanges(artifact, content);
      
      if (jsxChanges.length > 0) {
        console.log(`[Orchestrator] Applying ${jsxChanges.length} change(s) to JSX...`);
        
        // Convert JSX changes to DesignOverrides format for materializeAstWrite
        const overridesForWrite: DesignOverrides = {};
        
        for (const change of jsxChanges) {
          // For JSX changes, use base key (no state suffix)
          const key = change.nodeName;
          
          if (!overridesForWrite[key]) {
            overridesForWrite[key] = {
              nodeId: `prompt-${Date.now()}`,
              lastUpdated: new Date().toISOString(),
            };
          }
          
          switch (change.op) {
            case 'SET_TEXT':
              overridesForWrite[key].text = String(change.after);
              break;
            case 'SET_FILL':
              overridesForWrite[key].fill = String(change.after);
              break;
            case 'SET_LAYOUT':
              if (!overridesForWrite[key].layout) {
                overridesForWrite[key].layout = {};
              }
              if (change.layoutKey) {
                (overridesForWrite[key].layout as LayoutOverride)[change.layoutKey] = change.after;
              }
              break;
          }
        }

        // Call materializeAstWrite with the converted overrides
        const writeOptions: AstWriteOptions = {
          absolutePath,
          relativePath,
          content: markerContent ?? content, // Use updated content if markers were modified
          overrides: overridesForWrite,
          repoRoot,
          dryRun,
        };

        const writeResult = await materializeAstWrite(writeOptions);
        
        // Log the result
        logAstWriteResult(writeResult, '[Orchestrator]');
        
        applied = !dryRun && (writeResult.applied > 0 || stateResult.markerApplied > 0 || stateResult.overrideApplied > 0);
      } else {
        // No JSX changes, but markers/overrides may have been applied
        applied = !dryRun && (stateResult.markerApplied > 0 || stateResult.overrideApplied > 0);
      }

      // Write updated content if markers were modified
      if (markerContent && !dryRun && stateResult.markerApplied > 0) {
        await writeFile(absolutePath, markerContent, 'utf-8');
        console.log(`[Orchestrator] Updated ${stateResult.markerApplied} marker(s) in source file`);
      }
      
      // Summary
      console.log('[Orchestrator] Apply summary:');
      console.log(`[Orchestrator]   JSX changes: ${stateResult.jsxApplied} (via materializeAstWrite)`);
      console.log(`[Orchestrator]   Marker updates: ${stateResult.markerApplied}`);
      console.log(`[Orchestrator]   Override saves: ${stateResult.overrideApplied}`);
      console.log(`[Orchestrator]   Skipped: ${stateResult.skipped}`);
      
      if (dryRun) {
        console.log('[Orchestrator] Dry run complete: no files were modified');
      } else if (applied) {
        console.log('[Orchestrator] Successfully applied changes');
      } else {
        console.log('[Orchestrator] No changes were applied (values may already match or be non-writable)');
      }

      // Explain state-specific behavior
      if (state !== 'base' && stateResult.jsxApplied === 0) {
        console.log(`[Orchestrator] ℹ️  State "${state}" changes were applied to markers/overrides, NOT base JSX`);
        console.log('[Orchestrator]    This preserves the base component appearance.');
      }
    }
  }

  // ==========================================================================
  // POST-APPLY EMIT (Phase 9B)
  // ==========================================================================

  let postApplyEmitResult: PostApplyEmitResult | undefined;

  if (applied && isPostApplyEmitEnabled()) {
    console.log('[Orchestrator] Post-apply emit: enabled');

    postApplyEmitResult = await postApplyEmitDebounced({
      absolutePath,
      relativePath,
      componentKey,
      state,
    });

    if (postApplyEmitResult.sent) {
      console.log(
        `[Orchestrator] Post-apply emit: ops=${postApplyEmitResult.opsCount} ` +
        `sent=true clients=${postApplyEmitResult.serverClientsNotified ?? 0}`
      );
    } else if (postApplyEmitResult.error) {
      console.warn(`[Orchestrator] Post-apply emit: failed - ${postApplyEmitResult.error}`);
    } else {
      console.log(`[Orchestrator] Post-apply emit: skipped (no ops to send)`);
    }
  } else if (applied) {
    console.log('[Orchestrator] Post-apply emit: disabled (POST_APPLY_EMIT=false)');
  } else if (!dryRun) {
    console.log('[Orchestrator] Post-apply emit: skipped (no changes applied)');
  }

  // ==========================================================================
  // RETURN RESULT
  // ==========================================================================

  return {
    success: true,
    artifactPath,
    artifact,
    changesCount: artifact.changes.length,
    skippedCount: artifact.skipped.length,
    applied,
    postApplyEmit: postApplyEmitResult
      ? {
          attempted: true,
          sent: postApplyEmitResult.sent,
          opsCount: postApplyEmitResult.opsCount,
          clientsNotified: postApplyEmitResult.serverClientsNotified,
          error: postApplyEmitResult.error,
        }
      : applied && !isPostApplyEmitEnabled()
        ? { attempted: false, sent: false, opsCount: 0 }
        : undefined,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { PROMPT_PATCH_SUFFIX };
