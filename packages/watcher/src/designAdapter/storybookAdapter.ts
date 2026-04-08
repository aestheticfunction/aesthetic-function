/**
 * @aesthetic-function/watcher - designAdapter/storybookAdapter.ts
 *
 * Phase 16C: Storybook MCP Adapter (Read-Only).
 *
 * INTEGRATION: This adapter connects to @storybook/addon-mcp running inside
 * the Storybook dev server. AF acts as an MCP client and invokes the addon's
 * read-only documentation tools by name via the MCP protocol.
 *
 * TRANSPORT:
 * 1. MCP — AF connects to @storybook/addon-mcp at {storybookUrl}/mcp via
 *    StreamableHTTP transport. This gives access to all documentation tools.
 *
 * 2. HTTP FALLBACK — If MCP is unavailable but Storybook is running, AF falls
 *    back to direct HTTP requests to the manifest endpoints:
 *    - /manifests/components.json
 *    - /manifests/docs.json
 *    This provides component inventory and props but without MCP tool features.
 *
 * CRITICAL CONSTRAINTS (NON-NEGOTIABLE):
 * - READ-ONLY. No write operations. No mutations.
 * - Write tools are NEVER invoked, even if exposed.
 * - Does not bypass watcher → server → AF plugin authority.
 * - Does not own reconciliation, policy, or persistence.
 * - If unavailable, AF works fully without it.
 *
 * SURFACE CLASSIFICATION:
 * - surfaceType: "runtime" — Storybook is a rendered component catalog/runtime
 *   (code-adjacent documentation metadata, not raw code AST)
 * - accessMode: "read-only" — AF only reads component state
 * - authorityRole: "external-non-authoritative" — data is informational
 * - stability: "observational" — point-in-time snapshot
 */

import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';

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
import type { SurfaceMetadata } from '@aesthetic-function/shared/surfaceMetadata';
import type {
  StorybookMCPConfig,
  StorybookOperatingMode,
  StorybookComponentMeta,
  StorybookProp,
  StorybookStory,
  StorybookInventory,
} from '@aesthetic-function/shared/storybookAdapter';

// =============================================================================
// BLOCKED TOOL REGISTRY
// =============================================================================

/**
 * Registry of @storybook/addon-mcp tools that are INTENTIONALLY BLOCKED in AF.
 *
 * These tools have mutation or execution side-effects. AF's mutation authority
 * flows through watcher → server → AF plugin. Even read-adjacent tools that
 * trigger test execution are blocked because they have side-effects.
 */
export const BLOCKED_STORYBOOK_TOOLS = [
  {
    tool: 'run-story-tests',
    reason: 'Test execution has side-effects (spawns vitest, modifies test state). AF adapters are observation-only.',
    category: 'test-execution' as const,
  },
  {
    tool: 'preview-stories',
    reason: 'Preview URL generation may trigger renders. AF reads manifest data only.',
    category: 'preview' as const,
  },
] as const;

export const BLOCKED_STORYBOOK_TOOL_NAMES = new Set(
  BLOCKED_STORYBOOK_TOOLS.map(t => t.tool),
);

// =============================================================================
// ALLOWED @storybook/addon-mcp READ TOOLS
// =============================================================================

/**
 * @storybook/addon-mcp + @storybook/mcp tools that AF is allowed to invoke.
 * These are read-only documentation and metadata tools.
 *
 * Discovered from @storybook/addon-mcp v0.5.0 + @storybook/mcp v0.6.2
 * by inspecting packages/addon-mcp/src/tools/ and packages/mcp/src/tools/.
 */
export const ALLOWED_STORYBOOK_TOOLS = [
  'list-all-documentation',           // → getComponents(), getInventory()
  'get-documentation',                // → getComponent(), getComponentMeta()
  'get-documentation-for-story',      // → story-level detail
  'get-storybook-story-instructions', // → framework detection, story patterns
] as const;

export const ALLOWED_STORYBOOK_TOOL_NAMES = new Set(ALLOWED_STORYBOOK_TOOLS);

// =============================================================================
// HEALTH CHECK TIMEOUT (fast, for isAvailable)
// =============================================================================

const HEALTH_CHECK_TIMEOUT_MS = 2000;

// =============================================================================
// MCP CLIENT MANAGEMENT
// =============================================================================

/**
 * Invoke a Storybook MCP tool via MCP protocol and return the text result.
 *
 * SAFETY: Default-deny. Only tools in ALLOWED_STORYBOOK_TOOL_NAMES may be invoked.
 */
async function callStorybookMCPTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  // Guard 1: reject known blocked tools with explicit reason
  const blockedEntry = BLOCKED_STORYBOOK_TOOLS.find(t => t.tool === toolName);
  if (blockedEntry) {
    throw new Error(
      `BLOCKED: Tool "${toolName}" is blocked by AF architecture. ` +
      `Reason: ${blockedEntry.reason}`,
    );
  }

  // Guard 2: default-deny — only explicitly allowed tools may be invoked
  if (!ALLOWED_STORYBOOK_TOOL_NAMES.has(toolName as typeof ALLOWED_STORYBOOK_TOOLS[number])) {
    throw new Error(
      `DENIED: Tool "${toolName}" is not in ALLOWED_STORYBOOK_TOOLS. ` +
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
// STORYBOOK MANIFEST TYPES (from @storybook/mcp component manifest)
// =============================================================================

interface StorybookManifestComponent {
  id: string;
  name: string;
  path: string;
  description?: string;
  summary?: string;
  import?: string;
  stories?: StorybookManifestStory[];
  reactDocgen?: ReactDocgenData;
  reactDocgenTypescript?: ReactDocgenTypescriptData;
  reactComponentMeta?: ReactDocgenTypescriptData;
  docs?: Record<string, unknown>;
}

interface StorybookManifestStory {
  name: string;
  id?: string;
  description?: string;
  snippet?: string;
  summary?: string;
}

interface ReactDocgenData {
  props?: Record<string, {
    description?: string;
    tsType?: TsType;
    type?: TsType;
    defaultValue?: { value: string };
    required?: boolean;
  }>;
}

interface ReactDocgenTypescriptData {
  props?: Record<string, {
    description?: string;
    type?: { name?: string; raw?: string };
    defaultValue?: { value: string };
    required?: boolean;
  }>;
}

interface TsType {
  name: string;
  raw?: string;
  value?: string;
  elements?: TsType[];
}

interface StorybookManifestMap {
  v: number;
  components: Record<string, StorybookManifestComponent>;
}

// =============================================================================
// STORYBOOK MCP ADAPTER
// =============================================================================

/**
 * Storybook MCP Adapter — connects to @storybook/addon-mcp for read-only
 * component metadata extraction.
 *
 * Surface classification:
 * - surfaceType: "runtime" — Storybook is a rendered component catalog
 * - accessMode: "read-only" — AF only reads component state
 * - authorityRole: "external-non-authoritative" — informational only
 * - stability: "observational" — point-in-time component snapshot
 */
export class StorybookMCPAdapter implements DesignAdapter {
  readonly id = 'storybook-mcp';
  readonly displayName = 'Storybook MCP Adapter';
  readonly version = '0.1.0';

  readonly surfaceMetadata: SurfaceMetadata = {
    surfaceType: 'runtime',
    accessMode: 'read-only',
    authorityRole: 'external-non-authoritative',
    stability: 'observational',
  };

  private config: StorybookMCPConfig;
  private mcpClient: Client | null = null;
  private mcpConnectionAttempted = false;
  private _operatingMode: StorybookOperatingMode = 'unavailable';
  private _unavailableReason: string | null = null;

  get operatingMode(): StorybookOperatingMode {
    return this._operatingMode;
  }

  get unavailableReason(): string | null {
    return this._unavailableReason;
  }

  constructor(config: StorybookMCPConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // AVAILABILITY & CONNECTION
  // ---------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    // Step 1: Health check the Storybook dev server (fast, 2s timeout)
    const reachable = await this.probeDevServer();
    if (!reachable) {
      this._operatingMode = 'unavailable';
      this._unavailableReason =
        `Storybook dev server not reachable at ${this.config.url}`;
      return false;
    }

    // Step 2: Validate framework is React
    const framework = await this.detectFramework();
    const expectedFramework = this.config.framework ?? 'react';
    if (framework && !framework.includes(expectedFramework)) {
      this._operatingMode = 'unavailable';
      this._unavailableReason =
        `Storybook framework "${framework}" is not supported. ` +
        `Phase 16C requires React. See: @storybook/addon-mcp compatibility.`;
      return false;
    }

    // Step 3: Try MCP endpoint
    const mcpOk = await this.probeMCPEndpoint();
    if (mcpOk) {
      this._operatingMode = 'mcp';
      this._unavailableReason = null;
      return true;
    }

    // Step 4: MCP unavailable but server is up → degraded HTTP fallback
    this._operatingMode = 'http-fallback';
    this._unavailableReason = null;
    return true;
  }

  /**
   * Fast probe of the Storybook dev server (HEAD request, 2s timeout).
   */
  private async probeDevServer(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      try {
        const response = await fetch(this.config.url, {
          method: 'HEAD',
          signal: controller.signal,
        });
        return response.ok || response.status === 405; // Some servers don't support HEAD
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  /**
   * Probe the MCP endpoint to check if addon-mcp is installed.
   */
  private async probeMCPEndpoint(): Promise<boolean> {
    try {
      const mcpUrl = `${this.config.url}${this.config.mcpPath ?? '/mcp'}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      try {
        const response = await fetch(mcpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'aesthetic-function-probe', version: '0.1.0' },
          } }),
          signal: controller.signal,
        });
        // MCP endpoint should respond with 200 and JSON-RPC
        return response.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  /**
   * Detect the Storybook framework from the manifest or runtime info.
   * Returns null if detection fails (we proceed with a warning in that case).
   */
  private async detectFramework(): Promise<string | null> {
    try {
      // Try to detect framework from Storybook's runtime headers or index
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      try {
        const response = await fetch(`${this.config.url}/index.json`, {
          signal: controller.signal,
        });
        if (response.ok) {
          // Storybook index.json doesn't directly expose framework, but we can
          // check the manifest for reactDocgen presence as a React indicator.
          // For now, return null (unknown) if we can't detect.
          return null;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Detection failed — not a hard error, proceed with warning
    }
    return null;
  }

  /**
   * Lazy-connect to the MCP endpoint.
   */
  private async ensureMCPConnection(): Promise<Client | null> {
    if (this.mcpClient) return this.mcpClient;
    if (this.mcpConnectionAttempted) return null;
    this.mcpConnectionAttempted = true;

    if (this._operatingMode === 'http-fallback' || this._operatingMode === 'unavailable') {
      return null;
    }

    try {
      const mcpUrl = `${this.config.url}${this.config.mcpPath ?? '/mcp'}`;

      // Try StreamableHTTP first (modern MCP transport)
      try {
        const transport = new StreamableHTTPClientTransport(
          new URL(mcpUrl),
        );
        const client = new Client(
          { name: 'aesthetic-function', version: '0.1.0' },
          { capabilities: {} },
        );
        await client.connect(transport);
        this.mcpClient = client;
        this._operatingMode = 'mcp';
        return client;
      } catch {
        // StreamableHTTP failed, try SSE
      }

      // Try SSE transport (older MCP servers)
      try {
        const transport = new SSEClientTransport(
          new URL(mcpUrl),
        );
        const client = new Client(
          { name: 'aesthetic-function', version: '0.1.0' },
          { capabilities: {} },
        );
        await client.connect(transport);
        this.mcpClient = client;
        this._operatingMode = 'mcp';
        return client;
      } catch {
        // SSE also failed — fall back to HTTP
      }

      this._operatingMode = 'http-fallback';
      return null;
    } catch {
      this._operatingMode = 'http-fallback';
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // CAPABILITY MANIFEST (reflects actual operating mode)
  // ---------------------------------------------------------------------------

  getCapabilities(): AdapterCapabilityManifest {
    const isMCP = this._operatingMode === 'mcp';

    return {
      // Available capabilities (read-only)
      readDesignTokens: false,          // Storybook doesn't have design tokens
      readComponents: true,             // Available in both MCP and HTTP fallback
      readStyles: false,                // Storybook doesn't have style definitions
      readFileData: true,               // Basic file data from manifest
      readScreenshots: false,           // Not supported in Phase 16C
      readDesignSystemKit: isMCP,       // Only via MCP tools
      readDesignCodeParity: false,      // Not applicable to Storybook

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
  // DESIGN ADAPTER INTERFACE METHODS
  // ---------------------------------------------------------------------------

  async getDesignTokens(): Promise<AdapterResult<DesignTokenValue[]>> {
    // Storybook does not provide design tokens — return empty
    return this.makeResult([], ['Storybook does not provide design tokens']);
  }

  async getComponent(name: string): Promise<AdapterResult<DesignComponent | null>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        // MCP path: use get-documentation tool
        const raw = await callStorybookMCPTool(client, 'get-documentation', { id: name.toLowerCase() });
        warnings.push(`transport: mcp`);
        const meta = this.parseDocumentationResponse(raw, name);
        if (!meta) return this.makeResult(null, [...warnings, `Component "${name}" not found`], start);
        return this.makeResult(this.metaToDesignComponent(meta), warnings, start);
      }

      // HTTP fallback: read manifest directly
      warnings.push('transport: http-fallback');
      const manifest = await this.fetchComponentManifest();
      if (!manifest) return this.makeResult(null, [...warnings, 'Component manifest unavailable'], start);

      const component = this.findComponentInManifest(manifest, name);
      if (!component) return this.makeResult(null, [...warnings, `Component "${name}" not found`], start);

      const meta = this.manifestComponentToMeta(component);
      return this.makeResult(this.metaToDesignComponent(meta), warnings, start);
    } catch (error) {
      warnings.push(`Error: ${(error as Error).message}`);
      return this.makeResult(null, warnings, start);
    }
  }

  async getComponents(): Promise<AdapterResult<DesignComponent[]>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        // MCP path: list-all-documentation with story IDs
        const raw = await callStorybookMCPTool(client, 'list-all-documentation', { withStoryIds: true });
        warnings.push('transport: mcp');
        // The list response is markdown — parse component names and fetch details
        const componentNames = this.parseListResponse(raw);
        const components: DesignComponent[] = [];
        for (const componentName of componentNames) {
          try {
            const docRaw = await callStorybookMCPTool(client, 'get-documentation', { id: componentName });
            const meta = this.parseDocumentationResponse(docRaw, componentName);
            if (meta) components.push(this.metaToDesignComponent(meta));
          } catch {
            warnings.push(`Failed to fetch details for "${componentName}"`);
          }
        }
        return this.makeResult(components, warnings, start);
      }

      // HTTP fallback: read manifest directly
      warnings.push('transport: http-fallback');
      const manifest = await this.fetchComponentManifest();
      if (!manifest) return this.makeResult([], [...warnings, 'Component manifest unavailable'], start);

      const components = Object.values(manifest.components).map(c =>
        this.metaToDesignComponent(this.manifestComponentToMeta(c)),
      );
      return this.makeResult(components, warnings, start);
    } catch (error) {
      warnings.push(`Error: ${(error as Error).message}`);
      return this.makeResult([], warnings, start);
    }
  }

  async getStyles(): Promise<AdapterResult<DesignStyle[]>> {
    // Storybook does not provide style definitions — return empty
    return this.makeResult([], ['Storybook does not provide style definitions']);
  }

  async getFileData(): Promise<AdapterResult<DesignFileData>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const manifest = await this.fetchComponentManifest();
      warnings.push(`transport: ${this._operatingMode === 'mcp' ? 'mcp' : 'http-fallback'}`);

      const componentCount = manifest ? Object.keys(manifest.components).length : 0;
      const storyCount = manifest
        ? Object.values(manifest.components).reduce((sum, c) => sum + (c.stories?.length ?? 0), 0)
        : 0;

      return this.makeResult({
        name: 'Storybook',
        lastModified: new Date().toISOString(),
        pageCount: 0,
        componentCount,
        styleCount: 0,
        variableCount: 0,
        meta: {
          storyCount,
          manifestVersion: manifest?.v,
          operatingMode: this._operatingMode,
        },
      }, warnings, start);
    } catch (error) {
      warnings.push(`Error: ${(error as Error).message}`);
      return this.makeResult({
        name: 'Storybook',
        lastModified: new Date().toISOString(),
        pageCount: 0,
        componentCount: 0,
        styleCount: 0,
        variableCount: 0,
      }, warnings, start);
    }
  }

  async getScreenshot(): Promise<AdapterResult<DesignScreenshot | null>> {
    return this.makeResult(null, ['Screenshots not supported in Phase 16C']);
  }

  // ---------------------------------------------------------------------------
  // STORYBOOK-SPECIFIC METHODS
  // ---------------------------------------------------------------------------

  /**
   * Get rich component metadata including props, stories, and variant axes.
   * This goes beyond the DesignAdapter interface to provide Storybook-specific data.
   */
  async getComponentMeta(name: string): Promise<AdapterResult<StorybookComponentMeta | null>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const client = await this.ensureMCPConnection();

      if (client) {
        try {
          const raw = await callStorybookMCPTool(client, 'get-documentation', { id: name.toLowerCase() });
          warnings.push('transport: mcp');
          const meta = this.parseDocumentationResponse(raw, name);
          // If MCP found the component, return it. Otherwise fall through to
          // HTTP manifest which does a name-based lookup (handles ID mismatches
          // like 'demobutton' vs actual ID 'components-demobutton').
          if (meta) return this.makeResult(meta, warnings, start);
          warnings.push('mcp: component not found by id, trying HTTP manifest');
        } catch {
          warnings.push('mcp: get-documentation failed, trying HTTP manifest');
        }
      }

      // HTTP fallback (also used when MCP returned null for the component)
      warnings.push('transport: http-fallback');
      const manifest = await this.fetchComponentManifest();
      if (!manifest) return this.makeResult(null, [...warnings, 'Manifest unavailable'], start);

      const component = this.findComponentInManifest(manifest, name);
      if (!component) return this.makeResult(null, [...warnings, `Component "${name}" not found`], start);

      return this.makeResult(this.manifestComponentToMeta(component), warnings, start);
    } catch (error) {
      warnings.push(`Error: ${(error as Error).message}`);
      return this.makeResult(null, warnings, start);
    }
  }

  /**
   * Get the full inventory of all components and stories in Storybook.
   */
  async getInventory(): Promise<AdapterResult<StorybookInventory>> {
    const start = Date.now();
    const warnings: string[] = [];

    try {
      const manifest = await this.fetchComponentManifest();
      warnings.push(`transport: ${this._operatingMode === 'mcp' ? 'mcp' : 'http-fallback'}`);

      if (!manifest) {
        return this.makeResult({
          components: [],
          totalStories: 0,
          manifestAvailable: false,
        }, [...warnings, 'Component manifest unavailable'], start);
      }

      const components = Object.values(manifest.components).map(c =>
        this.manifestComponentToMeta(c),
      );
      const totalStories = components.reduce((sum, c) => sum + c.stories.length, 0);

      return this.makeResult({
        components,
        totalStories,
        manifestAvailable: true,
      }, warnings, start);
    } catch (error) {
      warnings.push(`Error: ${(error as Error).message}`);
      return this.makeResult({
        components: [],
        totalStories: 0,
        manifestAvailable: false,
      }, warnings, start);
    }
  }

  // ---------------------------------------------------------------------------
  // MANIFEST FETCHING (HTTP)
  // ---------------------------------------------------------------------------

  private async fetchComponentManifest(): Promise<StorybookManifestMap | null> {
    try {
      const url = `${this.config.url}/manifests/components.json`;
      const timeout = this.config.timeout ?? 30000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) {
          return null;
        }

        return await response.json() as StorybookManifestMap;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // DATA CONVERSION
  // ---------------------------------------------------------------------------

  /**
   * Convert a raw manifest component to StorybookComponentMeta.
   */
  private manifestComponentToMeta(component: StorybookManifestComponent): StorybookComponentMeta {
    const props = this.extractProps(component);
    const stories = (component.stories ?? []).map(s => this.manifestStoryToStory(s, props));

    return {
      name: component.name,
      id: component.id,
      importPath: component.import,
      description: component.description ?? component.summary,
      props,
      stories,
    };
  }

  /**
   * Extract props from reactDocgen, reactDocgenTypescript, or reactComponentMeta.
   */
  private extractProps(component: StorybookManifestComponent): StorybookProp[] {
    // Try reactDocgen first (most detailed)
    if (component.reactDocgen?.props) {
      return Object.entries(component.reactDocgen.props).map(([name, prop]) => ({
        name,
        type: this.serializeTsType(prop.tsType ?? prop.type) ?? 'any',
        defaultValue: prop.defaultValue?.value,
        required: prop.required ?? false,
        description: prop.description,
      }));
    }

    // Try reactDocgenTypescript
    if (component.reactDocgenTypescript?.props) {
      return Object.entries(component.reactDocgenTypescript.props).map(([name, prop]) => ({
        name,
        type: prop.type?.raw ?? prop.type?.name ?? 'any',
        defaultValue: prop.defaultValue?.value,
        required: prop.required ?? false,
        description: prop.description,
      }));
    }

    // Try reactComponentMeta
    if (component.reactComponentMeta?.props) {
      return Object.entries(component.reactComponentMeta.props).map(([name, prop]) => ({
        name,
        type: prop.type?.raw ?? prop.type?.name ?? 'any',
        defaultValue: prop.defaultValue?.value,
        required: prop.required ?? false,
        description: prop.description,
      }));
    }

    return [];
  }

  /**
   * Serialize a TsType object to a type string.
   * Mirrors @storybook/mcp's serializeTsType logic.
   */
  private serializeTsType(tsType: TsType | undefined): string | null {
    if (!tsType) return null;
    if (tsType.raw) return tsType.raw;
    if (tsType.value) return tsType.value;
    if (tsType.elements) {
      const inner = tsType.elements
        .map(el => this.serializeTsType(el) ?? 'unknown')
        .filter(Boolean);
      if (inner.length > 0) return `${tsType.name}<${inner.join(', ')}>`;
    }
    return tsType.name;
  }

  /**
   * Convert a manifest story to StorybookStory with variant axis inference.
   */
  private manifestStoryToStory(
    story: StorybookManifestStory,
    props: StorybookProp[],
  ): StorybookStory {
    const result: StorybookStory = {
      id: story.id ?? '',
      name: story.name,
      snippet: story.snippet,
    };

    // Infer variant axes from story name matching prop values
    const variantAxes = this.inferVariantAxes(story.name, props);
    if (Object.keys(variantAxes).length > 0) {
      result.variantAxes = variantAxes;
    }

    return result;
  }

  /**
   * Infer variant axes by matching story name against prop names and union values.
   *
   * e.g., Story "Primary" + prop { variant: "'primary' | 'secondary'" }
   *   → { variant: 'primary' }
   */
  private inferVariantAxes(
    storyName: string,
    props: StorybookProp[],
  ): Record<string, string> {
    const axes: Record<string, string> = {};
    const normalizedName = storyName.toLowerCase().replace(/\s+/g, '');

    for (const prop of props) {
      // Extract union values from type string like "'primary' | 'secondary' | 'ghost'"
      const unionValues = this.extractUnionValues(prop.type);
      if (unionValues.length === 0) continue;

      for (const value of unionValues) {
        if (value.toLowerCase().replace(/\s+/g, '') === normalizedName) {
          axes[prop.name] = value;
          break;
        }
      }
    }

    return axes;
  }

  /**
   * Extract string literal values from a union type string.
   * "'primary' | 'secondary' | 'ghost'" → ['primary', 'secondary', 'ghost']
   */
  private extractUnionValues(typeStr: string): string[] {
    const matches = typeStr.match(/'([^']+)'/g);
    if (!matches) return [];
    return matches.map(m => m.replace(/'/g, ''));
  }

  /**
   * Convert StorybookComponentMeta to DesignComponent for the DesignAdapter interface.
   */
  private metaToDesignComponent(meta: StorybookComponentMeta): DesignComponent {
    const variants: DesignVariant[] = [];

    // Convert stories with variant axes to DesignVariant
    for (const story of meta.stories) {
      if (story.variantAxes && Object.keys(story.variantAxes).length > 0) {
        variants.push({
          name: story.name,
          id: story.id,
          properties: story.variantAxes,
        });
      }
    }

    return {
      name: meta.name,
      id: `storybook:${meta.id}`,
      type: 'component',
      properties: {
        props: meta.props.map((p: StorybookProp) => ({
          name: p.name,
          type: p.type,
          required: p.required,
          defaultValue: p.defaultValue,
        })),
        storyCount: meta.stories.length,
        importPath: meta.importPath,
      },
      variants: variants.length > 0 ? variants : undefined,
    };
  }

  /**
   * Find a component in the manifest by name (case-insensitive).
   */
  private findComponentInManifest(
    manifest: StorybookManifestMap,
    name: string,
  ): StorybookManifestComponent | null {
    const lower = name.toLowerCase();

    // Try exact ID match first
    if (manifest.components[lower]) {
      return manifest.components[lower];
    }

    // Try name match (case-insensitive)
    for (const component of Object.values(manifest.components)) {
      if (component.name.toLowerCase() === lower) {
        return component;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // MCP RESPONSE PARSING
  // ---------------------------------------------------------------------------

  /**
   * Parse the markdown response from get-documentation tool.
   * Returns null if the component wasn't found.
   */
  private parseDocumentationResponse(
    raw: string,
    name: string,
  ): StorybookComponentMeta | null {
    if (raw.includes('not found') || raw.includes('isError')) {
      return null;
    }

    // Parse the markdown response from @storybook/mcp
    const meta: StorybookComponentMeta = {
      name: '',
      id: name.toLowerCase(),
      props: [],
      stories: [],
    };

    // Extract component name from "# ComponentName"
    const nameMatch = raw.match(/^#\s+(.+)$/m);
    if (nameMatch) {
      meta.name = nameMatch[1].trim();
    } else {
      meta.name = name;
    }

    // Extract ID from "ID: componentid"
    const idMatch = raw.match(/^ID:\s+(.+)$/m);
    if (idMatch) {
      meta.id = idMatch[1].trim();
    }

    // Extract description (text between name/ID and first ## heading)
    const descMatch = raw.match(/^ID:\s+.+\n\n([\s\S]*?)(?=^##|\n```)/m);
    if (descMatch && descMatch[1].trim()) {
      meta.description = descMatch[1].trim();
    }

    // Extract stories from "## Stories" section
    const storiesMatch = raw.match(/## Stories\n([\s\S]*?)(?=## Props|$)/);
    if (storiesMatch) {
      const storiesBlock = storiesMatch[1];
      const storyHeaders = storiesBlock.matchAll(/### (.+)\n(?:\nStory ID:\s+(.+)\n)?/g);
      for (const match of storyHeaders) {
        const story: StorybookStory = {
          name: match[1].trim(),
          id: match[2]?.trim() ?? '',
        };
        // Look for code snippet after this story header
        const snippetMatch = storiesBlock.match(
          new RegExp(`### ${match[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?\`\`\`\\n([\\s\\S]*?)\`\`\``, 'm'),
        );
        if (snippetMatch) {
          story.snippet = snippetMatch[1].trim();
        }
        meta.stories.push(story);
      }
    }

    // Extract props from "## Props" section
    const propsMatch = raw.match(/## Props\n\n```\n([\s\S]*?)```/);
    if (propsMatch) {
      const propsBlock = propsMatch[1];
      // Parse TypeScript-like prop definitions
      const propLines = propsBlock.matchAll(
        /(?:\/\*\*\s*\n\s*(.+?)\s*\n\s*\*\/\n\s*)?(\w+)(\?)?:\s*(.+?)(?:\s*=\s*(.+?))?$/gm,
      );
      for (const match of propLines) {
        if (match[2] === 'export' || match[2] === 'type') continue;
        meta.props.push({
          name: match[2],
          type: match[4]?.replace(/;$/, '').trim() ?? 'any',
          required: !match[3],
          defaultValue: match[5]?.trim(),
          description: match[1]?.trim(),
        });
      }
    }

    // Infer variant axes for stories based on props
    for (const story of meta.stories) {
      const axes = this.inferVariantAxes(story.name, meta.props);
      if (Object.keys(axes).length > 0) {
        story.variantAxes = axes;
      }
    }

    return meta;
  }

  /**
   * Parse the list response from list-all-documentation to extract component names.
   */
  private parseListResponse(raw: string): string[] {
    const names: string[] = [];
    // The list response contains markdown with component names
    // Format: "- componentid: description" or "## Components\n- componentid"
    const matches = raw.matchAll(/^[-*]\s+(\w[\w-]*)/gm);
    for (const match of matches) {
      names.push(match[1]);
    }
    return names;
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private makeResult<T>(data: T, warnings: string[] = [], startMs?: number): AdapterResult<T> {
    return {
      data,
      adapterId: this.id,
      adapterName: this.displayName,
      durationMs: startMs ? Date.now() - startMs : 0,
      warnings,
      cached: false,
    };
  }
}
