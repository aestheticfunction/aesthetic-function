/**
 * @aesthetic-function/watcher - designAdapter/figmaConsoleMCPAdapter.ts
 *
 * Phase 16B: Figma Console MCP Adapter (Read-Only).
 *
 * INTEGRATION: This adapter connects to southleft/figma-console-mcp as an MCP
 * server using @modelcontextprotocol/sdk. AF acts as an MCP client and invokes
 * figma-console-mcp's read-only tools by name via the MCP protocol.
 *
 * TRANSPORT MODES (in order of preference):
 * 1. STDIO — AF spawns figma-console-mcp as a child process via `npx figma-console-mcp`
 *    and communicates over stdin/stdout using the MCP stdio transport.
 *    This gives access to all 92+ figma-console-mcp tools (AF blocks writes).
 *
 * 2. SSE — AF connects to an already-running figma-console-mcp instance via
 *    Server-Sent Events. This is the "Remote SSE" mode from figma-console-mcp
 *    which exposes only ~22 read-only tools — ideal for AF's read-only boundary.
 *
 * 3. REST FALLBACK — If figma-console-mcp is not available (not installed,
 *    not running), AF falls back to direct Figma REST API calls. These calls
 *    replicate the same data that figma-console-mcp's read tools return
 *    (since figma-console-mcp itself calls the Figma REST API under the hood).
 *    This mode is clearly logged as "rest-fallback" in adapter results.
 *
 * CRITICAL CONSTRAINTS (NON-NEGOTIABLE):
 * - READ-ONLY. No write operations. No mutations.
 * - Write tools on the MCP server are NEVER invoked, even if available.
 * - Does not bypass watcher → server → AF plugin.
 * - Does not own reconciliation, policy, or persistence.
 * - If unavailable, AF works fully without it.
 *
 * BLOCKED figma-console-mcp CAPABILITIES:
 * See BLOCKED_MCP_TOOLS registry below. These tools are recognized, documented,
 * and will never be invoked. AF's mutation path is watcher → server → AF plugin ONLY.
 */

import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';

import type {
  DesignAdapter,
  AdapterResult,
  AdapterCapabilityManifest,
  DesignTokenValue,
  DesignComponent,
  DesignVariant,
  DesignStyle,
  DesignFileData,
  DesignScreenshot,
} from '@aesthetic-function/shared/designAdapter';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Transport mode for connecting to figma-console-mcp.
 *
 * - 'stdio': Spawn figma-console-mcp as child process (npx figma-console-mcp).
 *            Requires figma-console-mcp to be installable via npx.
 * - 'sse':   Connect to a running figma-console-mcp SSE server.
 *            Requires an SSE URL (e.g., http://localhost:3333/sse).
 * - 'rest-fallback': Direct Figma REST API calls (no figma-console-mcp needed).
 *            Same data, but without figma-console-mcp's live plugin bridge.
 */
export type MCPTransportMode = 'stdio' | 'sse' | 'rest-fallback';

/**
 * Configuration for the Figma Console MCP Adapter.
 */
export interface FigmaConsoleMCPConfig {
  /** Figma Personal Access Token (starts with 'figd_') */
  accessToken: string;

  /** Figma file key (from URL: figma.com/design/{fileKey}/...) */
  fileKey: string;

  /**
   * Transport mode for connecting to figma-console-mcp.
   * Default: 'stdio' (preferred — spawns figma-console-mcp as child process)
   */
  transport?: MCPTransportMode;

  /**
   * SSE server URL (required when transport is 'sse').
   * Example: 'http://localhost:3333/sse'
   */
  sseUrl?: string;

  /** Optional: node IDs to scope extraction to specific pages/frames */
  nodeIds?: string[];

  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

// Figma REST API base URL
const FIGMA_API_BASE = 'https://api.figma.com/v1';

// =============================================================================
// BLOCKED TOOL REGISTRY
// =============================================================================

/**
 * Registry of figma-console-mcp tools that are INTENTIONALLY BLOCKED in AF.
 *
 * Each entry documents:
 * - tool: The MCP tool name
 * - reason: Why it's blocked
 * - category: Classification for logging
 *
 * This is not a "todo" list. These tools are blocked by architectural decision.
 * AF's mutation authority flows through watcher → server → AF plugin.
 */
export const BLOCKED_MCP_TOOLS = [
  // Design creation
  {
    tool: 'figma_execute',
    reason: 'Arbitrary Plugin API execution bypasses AF control plane',
    category: 'design-creation' as const,
  },
  {
    tool: 'figma_arrange_component_set',
    reason: 'Component mutation is AF plugin responsibility',
    category: 'design-creation' as const,
  },
  {
    tool: 'figma_set_description',
    reason: 'Design metadata mutation is AF plugin responsibility',
    category: 'design-creation' as const,
  },

  // Variable management (all CRUD)
  {
    tool: 'figma_create_variable_collection',
    reason: 'Token authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_create_variable',
    reason: 'Token authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_update_variable',
    reason: 'Token authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_rename_variable',
    reason: 'Token authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_delete_variable',
    reason: 'Token authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_delete_variable_collection',
    reason: 'Token authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_add_mode',
    reason: 'Mode management is AF reconciliation engine responsibility',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_rename_mode',
    reason: 'Mode management is AF reconciliation engine responsibility',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_batch_create_variables',
    reason: 'Token authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_batch_update_variables',
    reason: 'Token authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },
  {
    tool: 'figma_setup_design_tokens',
    reason: 'Token system authority belongs to AF reconciliation engine',
    category: 'variable-management' as const,
  },

  // Cloud relay
  {
    tool: 'figma_pair_plugin',
    reason: 'AF has its own relay (server). Cloud pairing would create second control plane',
    category: 'cloud-relay' as const,
  },

  // FigJam
  {
    tool: 'figjam_create_sticky',
    reason: 'FigJam mutation is outside AF scope',
    category: 'figjam' as const,
  },
  {
    tool: 'figjam_create_stickies',
    reason: 'FigJam mutation is outside AF scope',
    category: 'figjam' as const,
  },
  {
    tool: 'figjam_create_connector',
    reason: 'FigJam mutation is outside AF scope',
    category: 'figjam' as const,
  },
  {
    tool: 'figjam_create_shape_with_text',
    reason: 'FigJam mutation is outside AF scope',
    category: 'figjam' as const,
  },
  {
    tool: 'figjam_create_table',
    reason: 'FigJam mutation is outside AF scope',
    category: 'figjam' as const,
  },
  {
    tool: 'figjam_create_code_block',
    reason: 'FigJam mutation is outside AF scope',
    category: 'figjam' as const,
  },
  {
    tool: 'figjam_auto_arrange',
    reason: 'FigJam mutation is outside AF scope',
    category: 'figjam' as const,
  },

  // Slides
  {
    tool: 'figma_create_slide',
    reason: 'Slides mutation is outside AF scope',
    category: 'slides' as const,
  },
  {
    tool: 'figma_delete_slide',
    reason: 'Slides mutation is outside AF scope',
    category: 'slides' as const,
  },
  {
    tool: 'figma_duplicate_slide',
    reason: 'Slides mutation is outside AF scope',
    category: 'slides' as const,
  },
  {
    tool: 'figma_reorder_slides',
    reason: 'Slides mutation is outside AF scope',
    category: 'slides' as const,
  },
  {
    tool: 'figma_set_slide_transition',
    reason: 'Slides mutation is outside AF scope',
    category: 'slides' as const,
  },
  {
    tool: 'figma_add_text_to_slide',
    reason: 'Slides mutation is outside AF scope',
    category: 'slides' as const,
  },
  {
    tool: 'figma_add_shape_to_slide',
    reason: 'Slides mutation is outside AF scope',
    category: 'slides' as const,
  },
  {
    tool: 'figma_set_slide_background',
    reason: 'Slides mutation is outside AF scope',
    category: 'slides' as const,
  },
] as const;

/**
 * Set of blocked tool names for O(1) lookup.
 */
export const BLOCKED_TOOL_NAMES = new Set(BLOCKED_MCP_TOOLS.map(t => t.tool));

// =============================================================================
// ALLOWED figma-console-mcp READ TOOLS
// =============================================================================

/**
 * figma-console-mcp tools that AF is allowed to invoke.
 * These are read-only data extraction tools.
 */
export const ALLOWED_MCP_TOOLS = [
  'figma_get_variables',              // → getDesignTokens()
  'figma_get_component',              // → getComponent()
  'figma_get_component_for_development', // → getComponent() enrichment
  'figma_get_component_image',        // → component thumbnail
  'figma_get_styles',                 // → getStyles()
  'figma_get_file_data',              // → getFileData(), getComponents()
  'figma_get_file_for_plugin',        // → plugin context
  'figma_get_design_system_kit',      // → all-in-one design system read
  'figma_take_screenshot',            // → getScreenshot()
  'figma_check_design_parity',        // → design-code parity check
  'figma_generate_component_doc',     // → documentation generation
  'figma_navigate',                   // → navigation context
  'figma_get_status',                 // → connection status
  'figma_get_console_logs',           // → debug logs
] as const;

export const ALLOWED_TOOL_NAMES = new Set(ALLOWED_MCP_TOOLS);

// =============================================================================
// MCP CLIENT MANAGEMENT
// =============================================================================

/**
 * Create an MCP client connected to figma-console-mcp via stdio transport.
 *
 * WHY STDIO: When AF spawns figma-console-mcp as a child process, it gets
 * access to all 92+ tools (AF only invokes the allowed read tools).
 * This is the preferred transport because it doesn't require a separately
 * running server.
 */
async function createStdioMCPClient(
  accessToken: string,
  _timeout: number,
): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'figma-console-mcp', `--figma-access-token=${accessToken}`],
    stderr: 'pipe',
    env: {
      ...process.env as Record<string, string>,
      FIGMA_ACCESS_TOKEN: accessToken,
    },
  });

  const client = new Client(
    { name: 'aesthetic-function', version: '0.2.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  return client;
}

/**
 * Invoke a figma-console-mcp tool via MCP protocol and return the text result.
 *
 * SAFETY: Default-deny. Only tools in ALLOWED_TOOL_NAMES may be invoked.
 * - Tools in BLOCKED_TOOL_NAMES → rejected with explicit reason.
 * - Tools not in ALLOWED_TOOL_NAMES → rejected as unclassified.
 * - Only tools in ALLOWED_TOOL_NAMES → invoked.
 */
async function callMCPTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  // Guard 1: reject known blocked tools with explicit reason
  if (BLOCKED_TOOL_NAMES.has(toolName as typeof BLOCKED_MCP_TOOLS[number]['tool'])) {
    throw new Error(
      `BLOCKED: Tool "${toolName}" is a write operation blocked by AF architecture. ` +
      `AF's mutation path is watcher → server → plugin ONLY.`,
    );
  }

  // Guard 2: default-deny — only explicitly allowed tools may be invoked
  if (!ALLOWED_TOOL_NAMES.has(toolName as typeof ALLOWED_MCP_TOOLS[number])) {
    throw new Error(
      `DENIED: Tool "${toolName}" is not in ALLOWED_MCP_TOOLS. ` +
      `AF uses a default-deny policy — only explicitly allowed read tools may be invoked.`,
    );
  }

  const result = await client.callTool({ name: toolName, arguments: args });

  // Extract text content from MCP result
  const textParts = (result.content as Array<{ type: string; text?: string }>)
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text!);

  return textParts.join('\n');
}

// =============================================================================
// FIGMA REST API FALLBACK
// =============================================================================

/**
 * Make a read-only GET request to the Figma REST API.
 * Only GET requests are allowed — POST/PUT/DELETE are architecturally blocked.
 *
 * This is the REST FALLBACK path — used when figma-console-mcp is not available.
 * It replicates the same Figma API calls that figma-console-mcp makes internally.
 */
async function figmaGet<T>(
  path: string,
  options: FigmaApiOptions,
): Promise<T> {
  const url = `${FIGMA_API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-FIGMA-TOKEN': options.accessToken,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => '');
      throw new Error(`Figma API ${response.status}: ${msg.slice(0, 200)}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download an image from a Figma-provided URL.
 */
async function downloadImage(
  url: string,
  timeout: number,
): Promise<{ data: string; format: 'png' }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Image download failed: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return { data: base64, format: 'png' as const };
  } finally {
    clearTimeout(timer);
  }
}

// =============================================================================
// FIGMA API RESPONSE TYPES (subset we care about)
// =============================================================================

interface FigmaFileResponse {
  name: string;
  lastModified: string;
  document: FigmaNode;
  components: Record<string, FigmaComponentMeta>;
  styles: Record<string, FigmaStyleMeta>;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  // Component properties
  fills?: FigmaFill[];
  strokes?: FigmaFill[];
  cornerRadius?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  characters?: string;
  style?: Record<string, unknown>;
  componentPropertyDefinitions?: Record<string, unknown>;
}

interface FigmaFill {
  type: string;
  color?: { r: number; g: number; b: number; a?: number };
}

interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  containing_frame?: { name: string; nodeId: string };
}

interface FigmaStyleMeta {
  key: string;
  name: string;
  style_type: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  description: string;
}

interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  valuesByMode: Record<string, FigmaVariableValue>;
  description?: string;
}

type FigmaVariableValue =
  | { r: number; g: number; b: number; a?: number }
  | number
  | string
  | boolean
  | { type: 'VARIABLE_ALIAS'; id: string };

interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
}

interface FigmaImagesResponse {
  images: Record<string, string>;
}

interface FigmaApiOptions {
  accessToken: string;
  timeout: number;
}

// =============================================================================
// ADAPTER IMPLEMENTATION
// =============================================================================

/**
 * Figma Console MCP Adapter — read-only, AF-constrained.
 *
 * INTEGRATION MODEL:
 * This adapter integrates with southleft/figma-console-mcp as an MCP client.
 * AF spawns or connects to figma-console-mcp and invokes its named read tools
 * via the Model Context Protocol.
 *
 * Tool mapping (figma-console-mcp tool name → AF adapter method):
 * - figma_get_variables          → getDesignTokens()
 * - figma_get_component          → getComponent()
 * - figma_get_file_data          → getComponents(), getFileData()
 * - figma_get_styles             → getStyles()
 * - figma_take_screenshot        → getScreenshot()
 * - figma_get_design_system_kit  → (future: all-in-one read)
 *
 * TRANSPORTS:
 * - 'stdio': Spawn figma-console-mcp, communicate via MCP stdio protocol
 * - 'sse':   Connect to running figma-console-mcp SSE server (not yet wired)
 * - 'rest-fallback': Direct Figma REST API (same underlying data, no MCP)
 *
 * All write tools are BLOCKED. See BLOCKED_MCP_TOOLS registry above.
 */
export class FigmaConsoleMCPAdapter implements DesignAdapter {
  readonly id = 'figma-console-mcp';
  readonly displayName = 'Figma Console MCP Adapter';
  readonly version = '0.2.0';

  private config: FigmaConsoleMCPConfig;
  private apiOptions: FigmaApiOptions;
  private mcpClient: Client | null = null;
  private mcpConnectionAttempted = false;
  private activeTransport: MCPTransportMode = 'rest-fallback';
  private fileCache: FigmaFileResponse | null = null;

  constructor(config: FigmaConsoleMCPConfig) {
    this.config = config;
    this.apiOptions = {
      accessToken: config.accessToken,
      timeout: config.timeout ?? 30000,
    };
  }

  // ---------------------------------------------------------------------------
  // MCP CONNECTION MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Attempt to connect to figma-console-mcp via MCP transport.
   * Falls back to REST if MCP connection fails.
   *
   * Connection is lazy — only attempted on first data request.
   */
  private async ensureMCPConnection(): Promise<Client | null> {
    if (this.mcpClient) return this.mcpClient;
    if (this.mcpConnectionAttempted) return null; // Already failed, use REST fallback
    this.mcpConnectionAttempted = true;

    const transport = this.config.transport ?? 'stdio';

    if (transport === 'rest-fallback') {
      this.activeTransport = 'rest-fallback';
      return null;
    }

    if (transport === 'stdio') {
      try {
        this.mcpClient = await createStdioMCPClient(
          this.config.accessToken,
          this.config.timeout ?? 30000,
        );
        this.activeTransport = 'stdio';
        return this.mcpClient;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // figma-console-mcp not available — fall back to REST
        this.activeTransport = 'rest-fallback';
        this.mcpClient = null;
        // Log fallback (observability)
        if (process.env.TRACE || process.env.TRACE_VERBOSE) {
          console.error(`[figma-console-mcp] MCP stdio connection failed: ${msg}`);
          console.error('[figma-console-mcp] Falling back to direct Figma REST API');
        }
        return null;
      }
    }

    if (transport === 'sse') {
      // SSE transport requires a running figma-console-mcp server
      // The SSEClientTransport from MCP SDK connects to the SSE endpoint
      if (!this.config.sseUrl) {
        this.activeTransport = 'rest-fallback';
        return null;
      }
      try {
        // Dynamic import to avoid requiring eventsource at module load time
        const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse');
        const sseTransport = new SSEClientTransport(new URL(this.config.sseUrl));
        const client = new Client(
          { name: 'aesthetic-function', version: '0.2.0' },
          { capabilities: {} },
        );
        await client.connect(sseTransport);
        this.mcpClient = client;
        this.activeTransport = 'sse';
        return this.mcpClient;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.activeTransport = 'rest-fallback';
        this.mcpClient = null;
        if (process.env.TRACE || process.env.TRACE_VERBOSE) {
          console.error(`[figma-console-mcp] MCP SSE connection failed: ${msg}`);
          console.error('[figma-console-mcp] Falling back to direct Figma REST API');
        }
        return null;
      }
    }

    this.activeTransport = 'rest-fallback';
    return null;
  }

  /**
   * Close the MCP client connection if open.
   */
  async close(): Promise<void> {
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
      } catch { /* ignore close errors */ }
      this.mcpClient = null;
    }
  }

  // ---------------------------------------------------------------------------
  // AVAILABILITY
  // ---------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    if (!this.config.accessToken || !this.config.fileKey) return false;

    try {
      // Lightweight check: fetch file metadata only (via REST, fast)
      await figmaGet<{ name: string }>(
        `/files/${this.config.fileKey}?depth=1`,
        this.apiOptions,
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // DESIGN TOKENS (figma-console-mcp: figma_get_variables)
  // ---------------------------------------------------------------------------

  async getDesignTokens(): Promise<AdapterResult<DesignTokenValue[]>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        // MCP path: call figma_get_variables on figma-console-mcp
        const raw = await callMCPTool(client, 'figma_get_variables', {
          fileKey: this.config.fileKey,
        });
        const parsed = JSON.parse(raw) as FigmaVariablesResponse;
        const tokens = parseVariablesResponse(parsed);
        warnings.push(`transport: mcp-${this.activeTransport}`);
        return {
          data: tokens,
          adapterId: this.id,
          adapterName: this.displayName,
          durationMs: Date.now() - start,
          warnings,
          cached: false,
        };
      }

      // REST fallback path
      warnings.push('transport: rest-fallback');
      const data = await figmaGet<FigmaVariablesResponse>(
        `/files/${this.config.fileKey}/variables/local`,
        this.apiOptions,
      );
      const tokens = parseVariablesResponse(data);

      return {
        data: tokens,
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: false,
      };
    } catch (error) {
      warnings.push(`Variables error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        data: [],
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: false,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // COMPONENTS (figma-console-mcp: figma_get_component / figma_get_file_data)
  // ---------------------------------------------------------------------------

  async getComponent(name: string): Promise<AdapterResult<DesignComponent | null>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        // MCP path: use figma_get_file_data to get components, then filter
        const raw = await callMCPTool(client, 'figma_get_file_data', {
          fileKey: this.config.fileKey,
          depth: 3,
        });
        const file = JSON.parse(raw) as FigmaFileResponse;
        const components = extractComponents(file);
        const match = components.find(
          c => c.name.toLowerCase() === name.toLowerCase(),
        ) ?? null;
        if (!match) warnings.push(`Component "${name}" not found in file`);
        warnings.push(`transport: mcp-${this.activeTransport}`);
        return {
          data: match,
          adapterId: this.id,
          adapterName: this.displayName,
          durationMs: Date.now() - start,
          warnings,
          cached: false,
        };
      }

      // REST fallback
      warnings.push('transport: rest-fallback');
      const file = await this.getFileTree();
      const components = extractComponents(file);
      const match = components.find(
        c => c.name.toLowerCase() === name.toLowerCase(),
      ) ?? null;
      if (!match) warnings.push(`Component "${name}" not found in file`);

      return {
        data: match,
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: this.fileCache !== null,
      };
    } catch (error) {
      warnings.push(`File error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        data: null,
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: false,
      };
    }
  }

  async getComponents(): Promise<AdapterResult<DesignComponent[]>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        const raw = await callMCPTool(client, 'figma_get_file_data', {
          fileKey: this.config.fileKey,
          depth: 3,
        });
        const file = JSON.parse(raw) as FigmaFileResponse;
        warnings.push(`transport: mcp-${this.activeTransport}`);
        return {
          data: extractComponents(file),
          adapterId: this.id,
          adapterName: this.displayName,
          durationMs: Date.now() - start,
          warnings,
          cached: false,
        };
      }

      // REST fallback
      warnings.push('transport: rest-fallback');
      const file = await this.getFileTree();
      return {
        data: extractComponents(file),
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: this.fileCache !== null,
      };
    } catch (error) {
      warnings.push(`File error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        data: [],
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: false,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // STYLES (figma-console-mcp: figma_get_styles)
  // ---------------------------------------------------------------------------

  async getStyles(): Promise<AdapterResult<DesignStyle[]>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        const raw = await callMCPTool(client, 'figma_get_styles', {
          fileKey: this.config.fileKey,
        });
        // figma_get_styles returns styles — parse as file structure
        const data = JSON.parse(raw);
        warnings.push(`transport: mcp-${this.activeTransport}`);
        const styles: DesignStyle[] = Object.entries(data.styles ?? data ?? {}).map(
          ([id, meta]: [string, unknown]) => {
            const m = meta as FigmaStyleMeta;
            return {
              name: m.name,
              id,
              type: figmaStyleTypeToAF(m.style_type),
              properties: { description: m.description },
            };
          },
        );
        return {
          data: styles,
          adapterId: this.id,
          adapterName: this.displayName,
          durationMs: Date.now() - start,
          warnings,
          cached: false,
        };
      }

      // REST fallback
      warnings.push('transport: rest-fallback');
      const file = await this.getFileTree();
      const styles: DesignStyle[] = Object.entries(file.styles).map(
        ([id, meta]) => ({
          name: meta.name,
          id,
          type: figmaStyleTypeToAF(meta.style_type),
          properties: { description: meta.description },
        }),
      );

      return {
        data: styles,
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: this.fileCache !== null,
      };
    } catch (error) {
      warnings.push(`Styles error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        data: [],
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: false,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // FILE DATA (figma-console-mcp: figma_get_file_data)
  // ---------------------------------------------------------------------------

  async getFileData(): Promise<AdapterResult<DesignFileData>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        const raw = await callMCPTool(client, 'figma_get_file_data', {
          fileKey: this.config.fileKey,
          depth: 1,
        });
        const file = JSON.parse(raw) as FigmaFileResponse;
        warnings.push(`transport: mcp-${this.activeTransport}`);
        return {
          data: {
            name: file.name,
            lastModified: file.lastModified,
            pageCount: file.document?.children?.length ?? 0,
            componentCount: Object.keys(file.components ?? {}).length,
            styleCount: Object.keys(file.styles ?? {}).length,
            variableCount: 0,
            meta: {
              adapter: this.id,
              transport: `mcp-${this.activeTransport}`,
              fileKey: this.config.fileKey,
            },
          },
          adapterId: this.id,
          adapterName: this.displayName,
          durationMs: Date.now() - start,
          warnings,
          cached: false,
        };
      }

      // REST fallback
      warnings.push('transport: rest-fallback');
      const file = await this.getFileTree();
      return {
        data: {
          name: file.name,
          lastModified: file.lastModified,
          pageCount: file.document.children?.length ?? 0,
          componentCount: Object.keys(file.components).length,
          styleCount: Object.keys(file.styles).length,
          variableCount: 0,
          meta: {
            adapter: this.id,
            transport: 'rest-fallback',
            fileKey: this.config.fileKey,
          },
        },
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: this.fileCache !== null,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      warnings.push(`File error: ${msg}`);
      return {
        data: {
          name: 'unknown',
          lastModified: new Date().toISOString(),
          pageCount: 0,
          componentCount: 0,
          styleCount: 0,
          variableCount: 0,
          meta: { error: msg },
        },
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: false,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // SCREENSHOTS (figma-console-mcp: figma_take_screenshot)
  // ---------------------------------------------------------------------------

  async getScreenshot(nodeId?: string): Promise<AdapterResult<DesignScreenshot | null>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        // MCP path: figma_take_screenshot handles image capture internally
        const raw = await callMCPTool(client, 'figma_take_screenshot', {
          fileKey: this.config.fileKey,
          nodeId: nodeId ?? '0:1',
          format: 'png',
          scale: 1,
        });
        // figma_take_screenshot returns base64 image data or URL
        warnings.push(`transport: mcp-${this.activeTransport}`);
        try {
          const parsed = JSON.parse(raw);
          return {
            data: {
              data: parsed.data ?? parsed.image ?? raw,
              format: 'png',
              subject: nodeId ?? 'first-page',
              capturedAt: new Date().toISOString(),
            },
            adapterId: this.id,
            adapterName: this.displayName,
            durationMs: Date.now() - start,
            warnings,
            cached: false,
          };
        } catch {
          // If not JSON, treat as raw base64
          return {
            data: {
              data: raw,
              format: 'png',
              subject: nodeId ?? 'first-page',
              capturedAt: new Date().toISOString(),
            },
            adapterId: this.id,
            adapterName: this.displayName,
            durationMs: Date.now() - start,
            warnings,
            cached: false,
          };
        }
      }

      // REST fallback: use Figma Images API
      warnings.push('transport: rest-fallback');
      const ids = nodeId ?? '0:1';
      const imagesData = await figmaGet<FigmaImagesResponse>(
        `/images/${this.config.fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=1`,
        this.apiOptions,
      );

      const imageUrl = Object.values(imagesData.images)[0];
      if (!imageUrl) {
        warnings.push('No image returned for the requested node');
        return {
          data: null,
          adapterId: this.id,
          adapterName: this.displayName,
          durationMs: Date.now() - start,
          warnings,
          cached: false,
        };
      }

      const image = await downloadImage(imageUrl, this.apiOptions.timeout);
      return {
        data: {
          data: image.data,
          format: image.format,
          subject: nodeId ?? 'first-page',
          capturedAt: new Date().toISOString(),
        },
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: false,
      };
    } catch (error) {
      warnings.push(`Screenshot error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        data: null,
        adapterId: this.id,
        adapterName: this.displayName,
        durationMs: Date.now() - start,
        warnings,
        cached: false,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // CAPABILITIES
  // ---------------------------------------------------------------------------

  getCapabilities(): AdapterCapabilityManifest {
    return {
      // Allowed (read-only intelligence)
      readDesignTokens: true,
      readComponents: true,
      readStyles: true,
      readFileData: true,
      readScreenshots: true,
      readDesignSystemKit: true,
      readDesignCodeParity: this.activeTransport !== 'rest-fallback',

      // BLOCKED by AF architecture — intentional, not "not yet implemented"
      writeDesign: false,
      writeVariables: false,
      executeDesignCode: false,
      writeVariableCollections: false,
      cloudWriteRelay: false,
      writeFigJam: false,
      writeSlides: false,
    };
  }

  /**
   * Return which transport is currently active.
   * Useful for observability and debugging.
   */
  getActiveTransport(): MCPTransportMode {
    return this.activeTransport;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE: FILE TREE CACHE (REST fallback only)
  // ---------------------------------------------------------------------------

  private async getFileTree(): Promise<FigmaFileResponse> {
    if (this.fileCache) return this.fileCache;

    const depthParam = this.config.nodeIds?.length ? '' : '&depth=3';
    const idsParam = this.config.nodeIds?.length
      ? `&ids=${this.config.nodeIds.map(id => encodeURIComponent(id)).join(',')}`
      : '';

    this.fileCache = await figmaGet<FigmaFileResponse>(
      `/files/${this.config.fileKey}?geometry=paths${depthParam}${idsParam}`,
      this.apiOptions,
    );

    return this.fileCache;
  }
}

// =============================================================================
// DATA CONVERSION HELPERS
// =============================================================================

/**
 * Parse a full FigmaVariablesResponse into DesignTokenValue[].
 * Used by both MCP and REST fallback paths.
 */
function parseVariablesResponse(data: FigmaVariablesResponse): DesignTokenValue[] {
  const tokens: DesignTokenValue[] = [];
  const collections = data.meta.variableCollections;

  for (const variable of Object.values(data.meta.variables)) {
    const collection = collections[variable.variableCollectionId];
    const defaultModeId = collection?.defaultModeId;
    const defaultValue = defaultModeId
      ? variable.valuesByMode[defaultModeId]
      : Object.values(variable.valuesByMode)[0];

    const token = figmaVariableToToken(variable, defaultValue, collection);
    if (token) tokens.push(token);
  }

  return tokens;
}

/**
 * Convert a Figma variable to an AF DesignTokenValue.
 */
function figmaVariableToToken(
  variable: FigmaVariable,
  value: FigmaVariableValue | undefined,
  collection: FigmaVariableCollection | undefined,
): DesignTokenValue | null {
  if (value === undefined) return null;

  // Handle alias references
  if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'VARIABLE_ALIAS') {
    return {
      name: `${collection?.name ?? 'unknown'}/${variable.name}`,
      value: `alias:${value.id}`,
      type: resolvedTypeToTokenType(variable.resolvedType),
      description: variable.description,
      aliasOf: value.id,
    };
  }

  // Convert value to string
  let stringValue: string;
  let type = resolvedTypeToTokenType(variable.resolvedType);

  if (typeof value === 'object' && value !== null && 'r' in value) {
    // COLOR type — convert to hex
    const c = value as { r: number; g: number; b: number; a?: number };
    const toHex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
    stringValue = `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`.toUpperCase();
    type = 'color';
  } else {
    stringValue = String(value);
  }

  return {
    name: `${collection?.name ?? 'unknown'}/${variable.name}`,
    value: stringValue,
    type,
    description: variable.description,
  };
}

function resolvedTypeToTokenType(
  resolvedType: string,
): 'color' | 'spacing' | 'radius' | 'typography' | 'opacity' | 'other' {
  switch (resolvedType) {
    case 'COLOR':
      return 'color';
    case 'FLOAT':
      return 'spacing'; // Could be spacing, radius, opacity — spacing as default
    case 'STRING':
      return 'other';
    case 'BOOLEAN':
      return 'other';
    default:
      return 'other';
  }
}

/**
 * Extract DesignComponent[] from Figma file tree.
 */
function extractComponents(file: FigmaFileResponse): DesignComponent[] {
  const components: DesignComponent[] = [];
  const componentMeta = file.components;

  // Walk the document tree
  function walk(node: FigmaNode): void {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const meta = componentMeta[node.id];
      const variants: DesignVariant[] = [];

      // For component sets, children are variants
      if (node.type === 'COMPONENT_SET' && node.children) {
        for (const child of node.children) {
          if (child.type === 'COMPONENT') {
            variants.push({
              name: child.name,
              id: child.id,
              properties: parseVariantName(child.name),
            });
          }
        }
      }

      const afType = node.type === 'COMPONENT_SET' ? 'component-set' as const : 'component' as const;
      const properties: Record<string, unknown> = {};

      // Extract known properties
      if (node.fills) properties.fills = node.fills;
      if (node.cornerRadius !== undefined) properties.cornerRadius = node.cornerRadius;
      if (node.paddingTop !== undefined) properties.paddingTop = node.paddingTop;
      if (node.paddingRight !== undefined) properties.paddingRight = node.paddingRight;
      if (node.paddingBottom !== undefined) properties.paddingBottom = node.paddingBottom;
      if (node.paddingLeft !== undefined) properties.paddingLeft = node.paddingLeft;
      if (node.itemSpacing !== undefined) properties.itemSpacing = node.itemSpacing;
      if (node.characters) properties.characters = node.characters;
      if (node.absoluteBoundingBox) {
        properties.width = node.absoluteBoundingBox.width;
        properties.height = node.absoluteBoundingBox.height;
      }

      components.push({
        name: meta?.name ?? node.name,
        id: node.id,
        type: afType,
        properties,
        variants: variants.length > 0 ? variants : undefined,
      });
    }

    // Recurse
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(file.document);
  return components;
}

/**
 * Parse a Figma variant name like "State=Hover, Size=Large" into key-value pairs.
 */
function parseVariantName(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  const parts = name.split(',').map(s => s.trim());

  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      props[key] = value;
    }
  }

  return props;
}

/**
 * Map Figma style types to AF types.
 */
function figmaStyleTypeToAF(type: string): 'fill' | 'text' | 'effect' | 'grid' {
  switch (type) {
    case 'FILL':
      return 'fill';
    case 'TEXT':
      return 'text';
    case 'EFFECT':
      return 'effect';
    case 'GRID':
      return 'grid';
    default:
      return 'fill';
  }
}
