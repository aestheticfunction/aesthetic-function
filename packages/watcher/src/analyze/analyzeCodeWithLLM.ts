/**
 * @aesthetic-function/watcher - analyze/analyzeCodeWithLLM.ts
 *
 * PHASE 3 — LLM-based Intent Analyzer
 *
 * PURPOSE:
 * Analyze React source code using an LLM to extract design intent.
 * This provides intelligent understanding of component structure beyond
 * simple marker parsing.
 *
 * ARCHITECTURE:
 * - Constructs a strict system prompt for JSON-only output
 * - Sends React code + design token context to LLM
 * - Parses and validates the JSON response
 * - Includes retry + repair logic for invalid JSON
 * - Returns IntentModel conforming to existing types
 *
 * SAFETY:
 * - Chain-of-thought reasoning is internal only (not exposed)
 * - All outputs are validated against IntentModel schema
 * - Invalid responses trigger repair prompts
 * - Maximum retry limit prevents infinite loops
 *
 * INTEGRATION:
 * - Controlled by USE_LLM_ANALYZER environment variable
 * - When disabled, watcher uses marker-based parsing
 * - Does NOT modify protocol, plugin, or transformer
 */

import type { DesignTokenContext } from '../tokens/designTokens.js';
import type { IntentModel, Intent, ButtonIntent, TextIntent, FrameIntent } from '../transform/types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum number of retry attempts for invalid JSON responses.
 */
const MAX_RETRIES = 2;

/**
 * Maximum code length to send to LLM (prevents token overflow).
 */
const MAX_CODE_LENGTH = 8000;

/**
 * Maximum number of tokens to include in prompt context.
 */
const MAX_TOKEN_CONTEXT = 30;

/**
 * LLM provider configuration.
 * Supports OpenAI and Anthropic APIs.
 */
export type LLMProvider = 'openai' | 'anthropic';

/**
 * Get the configured LLM provider.
 */
export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  if (provider === 'anthropic') return 'anthropic';
  return 'openai'; // Default
}

/**
 * Get the API key for the configured provider.
 */
export function getLLMApiKey(): string | undefined {
  const provider = getLLMProvider();
  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY;
  }
  return process.env.OPENAI_API_KEY;
}

/**
 * Get the model name for the configured provider.
 */
export function getLLMModel(): string {
  const provider = getLLMProvider();
  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';
  }
  return process.env.OPENAI_MODEL ?? 'gpt-4o';
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for the LLM analyzer.
 */
export interface AnalyzeOptions {
  /**
   * Optional file path for context (helps LLM understand component location).
   */
  filePath?: string;

  /**
   * Whether to include analysis summary in the response (for debugging).
   * In production, this should be false to reduce token usage.
   */
  includeAnalysisSummary?: boolean;

  /**
   * Maximum number of intents to extract.
   * Prevents runaway token usage on large files.
   */
  maxIntents?: number;

  /**
   * Force use of stub implementation (for testing).
   */
  forceStub?: boolean;
}

/**
 * Result from the LLM analyzer.
 */
export interface AnalyzeResult {
  /**
   * The extracted IntentModel.
   */
  model: IntentModel;

  /**
   * Whether the result came from the LLM or a fallback.
   */
  source: 'llm' | 'stub' | 'cache';

  /**
   * Optional analysis summary (only if includeAnalysisSummary is true).
   * This is a high-level description, NOT chain-of-thought reasoning.
   */
  analysisSummary?: string;

  /**
   * Token usage statistics (for cost tracking).
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /**
   * Number of retry attempts needed (0 = success on first try).
   */
  retryCount?: number;
}

/**
 * Raw LLM response structure (before validation).
 */
interface RawLLMResponse {
  intents?: unknown[];
  analysisSummary?: string;
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

/**
 * The exact system prompt sent to the LLM.
 *
 * WHY THIS PROMPT:
 * - Strict JSON-only output prevents chain-of-thought leakage
 * - Explicit schema definition ensures type conformance
 * - Design token context enables semantic color mapping
 * - Examples guide the model toward correct output format
 */
export const SYSTEM_PROMPT = `You are a design-to-code analyzer. Your task is to analyze React component source code and extract design intent as structured JSON.

CRITICAL RULES:
1. Output ONLY valid JSON. No explanations, no markdown, no code blocks.
2. The JSON must conform exactly to the IntentModel schema below.
3. If you cannot extract any intents, return: {"intents": []}
4. Do NOT include reasoning or chain-of-thought in your output.

INTENT MODEL SCHEMA:

interface IntentModel {
  intents: Intent[];
  analysisSummary?: string; // Brief 1-2 sentence summary (optional)
}

type Intent = ButtonIntent | TextIntent | FrameIntent;

interface ButtonIntent {
  type: "BUTTON";
  nodeName: string;      // Suggested Figma node name (PascalCase)
  text: string;          // Button label text
  fillTokenOrHex: string; // Token name OR hex color (prefer tokens)
  textColorTokenOrHex?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
}

interface TextIntent {
  type: "TEXT";
  nodeName: string;      // Suggested Figma node name
  characters: string;    // Text content
  colorTokenOrHex?: string;
  fontSize?: number;
  fontWeight?: number;
}

interface FrameIntent {
  type: "FRAME";
  nodeName: string;
  fillTokenOrHex?: string;
  layoutDirection?: "horizontal" | "vertical";
  gap?: number;
  padding?: number;
}

EXTRACTION RULES:
1. For buttons: Extract text content, infer variant from className/style
2. For text: Extract h1-h6, p, span elements with visible text
3. For containers: Extract div/section with explicit styling
4. Map CSS colors to design tokens when possible
5. Generate meaningful nodeName values (e.g., "LoginButton", "PageTitle")

OUTPUT FORMAT:
{"intents": [...], "analysisSummary": "..."}`;

// =============================================================================
// PROMPT BUILDER
// =============================================================================

/**
 * Build the user prompt with code and token context.
 */
export function buildUserPrompt(
  code: string,
  tokenContext: DesignTokenContext,
  filePath?: string
): string {
  // Get token names for context
  const tokenNames = Array.from(tokenContext.tokens.keys()).slice(0, MAX_TOKEN_CONTEXT);

  // Truncate code if too long
  const truncatedCode = code.length > MAX_CODE_LENGTH
    ? code.slice(0, MAX_CODE_LENGTH) + '\n\n// ... (truncated)'
    : code;

  const fileContext = filePath ? `\nFile: ${filePath}` : '';

  return `AVAILABLE DESIGN TOKENS:
${tokenNames.map((t) => `- ${t}: ${tokenContext.tokens.get(t)?.value}`).join('\n')}

REACT SOURCE CODE:${fileContext}
\`\`\`tsx
${truncatedCode}
\`\`\`

Extract design intent as JSON:`;
}

/**
 * Build a repair prompt for invalid JSON.
 */
export function buildRepairPrompt(
  invalidJson: string,
  error: string
): string {
  return `The previous response was not valid JSON.

ERROR: ${error}

INVALID RESPONSE:
${invalidJson.slice(0, 500)}

Please output ONLY valid JSON conforming to the IntentModel schema.
If you cannot fix it, return: {"intents": []}`;
}

// =============================================================================
// LLM API CALLS
// =============================================================================

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMCallResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Call OpenAI API.
 */
async function callOpenAI(
  messages: LLMMessage[],
  apiKey: string,
  model: string
): Promise<LLMCallResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1, // Low temperature for consistent JSON output
      response_format: { type: 'json_object' }, // Force JSON mode
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? '{}',
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  };
}

/**
 * Call Anthropic API.
 */
async function callAnthropic(
  messages: LLMMessage[],
  apiKey: string,
  model: string
): Promise<LLMCallResult> {
  // Anthropic uses system as a separate field
  const systemMessage = messages.find((m) => m.role === 'system')?.content ?? '';
  const userMessages = messages.filter((m) => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemMessage,
      messages: userMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const textContent = data.content.find((c) => c.type === 'text')?.text ?? '{}';

  return {
    content: textContent,
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
  };
}

/**
 * Call the configured LLM provider.
 */
async function callLLM(messages: LLMMessage[]): Promise<LLMCallResult> {
  const provider = getLLMProvider();
  const apiKey = getLLMApiKey();
  const model = getLLMModel();

  if (!apiKey) {
    throw new Error(
      `No API key configured. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} environment variable.`
    );
  }

  if (provider === 'anthropic') {
    return callAnthropic(messages, apiKey, model);
  }
  return callOpenAI(messages, apiKey, model);
}

// =============================================================================
// JSON PARSING & VALIDATION
// =============================================================================

/**
 * Extract JSON from LLM response (handles markdown code blocks).
 */
function extractJSON(content: string): string {
  // Try to extract from markdown code block
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object directly
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return content.trim();
}

/**
 * Parse and validate LLM response as IntentModel.
 */
function parseAndValidateResponse(content: string): { model: IntentModel; raw: RawLLMResponse } | { error: string } {
  try {
    const jsonStr = extractJSON(content);
    const parsed = JSON.parse(jsonStr) as RawLLMResponse;

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      return { error: 'Response is not an object' };
    }

    if (!Array.isArray(parsed.intents)) {
      return { error: 'Missing or invalid "intents" array' };
    }

    // Validate and transform each intent
    const validIntents: Intent[] = [];

    for (let i = 0; i < parsed.intents.length; i++) {
      const intent = parsed.intents[i];

      if (!intent || typeof intent !== 'object') {
        continue; // Skip invalid intents
      }

      const obj = intent as Record<string, unknown>;

      // Validate required fields
      if (typeof obj.type !== 'string' || typeof obj.nodeName !== 'string') {
        continue;
      }

      // Validate by type
      switch (obj.type) {
        case 'BUTTON': {
          if (typeof obj.text !== 'string' || typeof obj.fillTokenOrHex !== 'string') {
            continue;
          }
          const buttonIntent: ButtonIntent = {
            type: 'BUTTON',
            nodeName: obj.nodeName as string,
            text: obj.text as string,
            fillTokenOrHex: obj.fillTokenOrHex as string,
          };
          if (typeof obj.textColorTokenOrHex === 'string') {
            buttonIntent.textColorTokenOrHex = obj.textColorTokenOrHex;
          }
          if (obj.variant === 'primary' || obj.variant === 'secondary' ||
              obj.variant === 'outline' || obj.variant === 'ghost') {
            buttonIntent.variant = obj.variant;
          }
          validIntents.push(buttonIntent);
          break;
        }

        case 'TEXT': {
          if (typeof obj.characters !== 'string') {
            continue;
          }
          const textIntent: TextIntent = {
            type: 'TEXT',
            nodeName: obj.nodeName as string,
            characters: obj.characters as string,
          };
          if (typeof obj.colorTokenOrHex === 'string') {
            textIntent.colorTokenOrHex = obj.colorTokenOrHex;
          }
          if (typeof obj.fontSize === 'number') {
            textIntent.fontSize = obj.fontSize;
          }
          if (typeof obj.fontWeight === 'number') {
            textIntent.fontWeight = obj.fontWeight;
          }
          validIntents.push(textIntent);
          break;
        }

        case 'FRAME': {
          const frameIntent: FrameIntent = {
            type: 'FRAME',
            nodeName: obj.nodeName as string,
          };
          if (typeof obj.fillTokenOrHex === 'string') {
            frameIntent.fillTokenOrHex = obj.fillTokenOrHex;
          }
          if (obj.layoutDirection === 'horizontal' || obj.layoutDirection === 'vertical') {
            frameIntent.layoutDirection = obj.layoutDirection;
          }
          if (typeof obj.gap === 'number') {
            frameIntent.gap = obj.gap;
          }
          if (typeof obj.padding === 'number') {
            frameIntent.padding = obj.padding;
          }
          validIntents.push(frameIntent);
          break;
        }

        default:
          // Unknown type, skip
          break;
      }
    }

    const model: IntentModel = {
      intents: validIntents,
      timestamp: new Date().toISOString(),
    };

    return { model, raw: parsed };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown parse error';
    return { error };
  }
}

// =============================================================================
// STUB IMPLEMENTATION (for testing/fallback)
// =============================================================================

/**
 * Create a stub IntentModel for testing or when LLM is unavailable.
 */
function createStubIntentModel(source?: string): IntentModel {
  const primaryButton: ButtonIntent = {
    type: 'BUTTON',
    nodeName: 'PrimaryButton',
    text: 'Get Started',
    fillTokenOrHex: 'Primary/Blue500',
    variant: 'primary',
  };

  const secondaryButton: ButtonIntent = {
    type: 'BUTTON',
    nodeName: 'SecondaryButton',
    text: 'Learn More',
    fillTokenOrHex: 'Neutral/Gray100',
    textColorTokenOrHex: 'Neutral/Gray900',
    variant: 'secondary',
  };

  const headingText: TextIntent = {
    type: 'TEXT',
    nodeName: 'PageHeading',
    characters: 'Welcome to the App',
    colorTokenOrHex: 'Neutral/Gray900',
    fontSize: 32,
    fontWeight: 700,
  };

  const descriptionText: TextIntent = {
    type: 'TEXT',
    nodeName: 'PageDescription',
    characters: 'Build something amazing today.',
    colorTokenOrHex: 'Neutral/Gray500',
    fontSize: 16,
    fontWeight: 400,
  };

  return {
    intents: [primaryButton, secondaryButton, headingText, descriptionText],
    source: source ?? 'stub',
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Analyze React code using LLM to extract design intent.
 *
 * BEHAVIOR:
 * 1. Constructs prompt with code and design token context
 * 2. Calls LLM API (OpenAI or Anthropic)
 * 3. Parses and validates JSON response
 * 4. Retries with repair prompt if JSON is invalid
 * 5. Falls back to stub on complete failure
 *
 * @param code - The React source code to analyze
 * @param designTokens - Available design tokens for context
 * @param options - Optional configuration
 * @returns Promise resolving to the analysis result
 *
 * @example
 * ```typescript
 * const result = await analyzeCodeWithLLM(
 *   fs.readFileSync('Button.tsx', 'utf-8'),
 *   getDefaultTokenContext(),
 *   { filePath: 'src/components/Button.tsx' }
 * );
 *
 * console.log(result.model.intents);
 * // [{ type: 'BUTTON', nodeName: 'LoginButton', ... }]
 * ```
 */
export async function analyzeCodeWithLLM(
  code: string,
  designTokens: DesignTokenContext,
  options?: AnalyzeOptions
): Promise<AnalyzeResult> {
  const filePath = options?.filePath ?? 'unknown';

  // Check for stub mode
  if (options?.forceStub || !getLLMApiKey()) {
    const model = createStubIntentModel(filePath);
    model.source = filePath;

    return {
      model,
      source: 'stub',
      analysisSummary: options?.includeAnalysisSummary
        ? 'Stub response (no LLM API key configured)'
        : undefined,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  // Build messages
  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(code, designTokens, options?.filePath) },
  ];

  let retryCount = 0;
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let lastError = '';
  let lastResponse = '';

  // Main LLM call with retry loop
  while (retryCount <= MAX_RETRIES) {
    try {
      const result = await callLLM(messages);

      // Accumulate usage
      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
      totalUsage.totalTokens += result.usage.totalTokens;

      lastResponse = result.content;

      // Parse and validate
      const parseResult = parseAndValidateResponse(result.content);

      if ('model' in parseResult) {
        // Success!
        parseResult.model.source = filePath;

        return {
          model: parseResult.model,
          source: 'llm',
          analysisSummary: options?.includeAnalysisSummary
            ? (parseResult.raw.analysisSummary as string | undefined)
            : undefined,
          usage: totalUsage,
          retryCount,
        };
      }

      // Parse failed, prepare for retry
      lastError = parseResult.error;

      if (retryCount < MAX_RETRIES) {
        // Add repair prompt
        messages.push({ role: 'assistant', content: result.content });
        messages.push({ role: 'user', content: buildRepairPrompt(result.content, parseResult.error) });
      }

      retryCount++;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      retryCount++;

      // Don't retry on API errors (likely rate limit or auth issues)
      if (lastError.includes('API error')) {
        break;
      }
    }
  }

  // All retries failed, fall back to stub
  console.warn(`[LLM Analyzer] Failed after ${retryCount} attempts: ${lastError}`);
  console.warn(`[LLM Analyzer] Last response: ${lastResponse.slice(0, 200)}`);

  const model = createStubIntentModel(filePath);
  model.source = filePath;

  return {
    model,
    source: 'stub',
    analysisSummary: options?.includeAnalysisSummary
      ? `Fallback to stub after ${retryCount} failed attempts. Error: ${lastError}`
      : undefined,
    usage: totalUsage,
    retryCount,
  };
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Validate that an IntentModel has the expected structure.
 * Useful for validating LLM responses before use.
 */
export function validateIntentModel(model: unknown): model is IntentModel {
  if (!model || typeof model !== 'object') {
    return false;
  }

  const obj = model as Record<string, unknown>;

  if (!Array.isArray(obj.intents)) {
    return false;
  }

  for (const intent of obj.intents) {
    if (!intent || typeof intent !== 'object') {
      return false;
    }

    const intentObj = intent as Record<string, unknown>;

    if (typeof intentObj.type !== 'string') {
      return false;
    }
    if (typeof intentObj.nodeName !== 'string') {
      return false;
    }

    switch (intentObj.type) {
      case 'BUTTON':
        if (typeof intentObj.text !== 'string') return false;
        if (typeof intentObj.fillTokenOrHex !== 'string') return false;
        break;
      case 'TEXT':
        if (typeof intentObj.characters !== 'string') return false;
        break;
      case 'FRAME':
        // fillTokenOrHex is optional for frames
        break;
      default:
        break;
    }
  }

  return true;
}

/**
 * Build a prompt for the LLM analyzer (legacy interface).
 * @deprecated Use buildUserPrompt instead.
 */
export function buildAnalyzerPrompt(code: string, tokenNames: string[]): string {
  return `AVAILABLE DESIGN TOKENS:
${tokenNames.slice(0, MAX_TOKEN_CONTEXT).join('\n')}

REACT SOURCE CODE:
\`\`\`tsx
${code.slice(0, MAX_CODE_LENGTH)}
\`\`\`

Extract design intent as JSON:`;
}

/**
 * Check if LLM analyzer is available (API key configured).
 */
export function isLLMAnalyzerAvailable(): boolean {
  return !!getLLMApiKey();
}

/**
 * Check if USE_LLM_ANALYZER feature flag is enabled.
 */
export function isLLMAnalyzerEnabled(): boolean {
  const flag = process.env.USE_LLM_ANALYZER?.toLowerCase();
  return flag === 'true' || flag === '1';
}
