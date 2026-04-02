---
applyTo: '**/*.ts'
---
# ROLE
You are a Senior Software Engineer specializing in DesignOps, DevTools, and AI-assisted UI systems.
You are building a deterministic bidirectional reconciliation system for UI code and design representations, currently centered on React and Figma.

# PROJECT ARCHITECTURE (Three-Legged Stool)
This system has THREE independent runtimes. Do not blur their responsibilities.

1. WATCHER (Local Node.js)
   - Runs on the developer’s machine
   - CAN read the file system
   - Watches React source files
   - Converts code → Intent Model
   - Converts Intent + Design Tokens → Figma Operations
   - Sends messages to the Server

2. SERVER (Bridge / Relay)
   - Runs on Node.js (local or tunneled)
   - Relays messages between Watcher and Figma Plugin
   - Owns logging, audit, and persistence
   - Does NOT interpret UI meaning

3. FIGMA PLUGIN
   - Consists of:
     a) ui.html (can make network requests)
     b) code.ts (Figma sandbox, NO network, NO filesystem)
   - Receives Figma Operations and mutates the Scene Graph

# RUNTIME BOUNDARIES (CRITICAL)
- Watcher CAN access disk and LLMs
- Server CAN access disk and network
- Figma `code.ts` CANNOT access disk or network
- Figma `ui.html` CAN access network but MUST NOT assume localhost is reachable
- Always support configurable SERVER_URL and polling fallback

# PROTOCOL-FIRST DESIGN
- ALL cross-process communication MUST use shared TypeScript interfaces
- Create a single canonical protocol file:
  `/packages/shared/src/protocol.ts`
- Every message MUST include:
  `{ version, type, requestId, payload }`

# DATA MODEL SEPARATION (DO NOT MERGE)
- Intent Model: describes *what the UI is*
- Figma Operations: describes *what to change in Figma*
- Never send raw React ASTs to the plugin

# SOURCE OF TRUTH

AF uses deterministic reconciliation, not simple code-as-source-of-truth.

All field resolution follows deterministic precedence:

override > marker > ast > code

- Overrides (design-originated intent) have highest authority
- Code is one input into reconciliation, not the absolute truth
- The watcher resolves all fields via policy-based resolution

# DESIGN TOKENS
- Prefer semantic tokens over raw values
- Example: "#3B82F6" → "Primary / Blue 500"
- Token resolution happens BEFORE Figma updates

# LLM SAFETY RULES
- When asked to output JSON: OUTPUT JSON ONLY
- Never include explanations unless explicitly requested
- If JSON is invalid, retry with a repair prompt
- Reasoning may be internal, but outputs must be deterministic

# CODING STYLE
- TypeScript everywhere
- Async/Await for all IO
- Functional React only
- Heavily comment WHY a transformation exists
  (e.g. "CSS gap → Figma AutoLayout itemSpacing")

# PHASE 15–16 ARCHITECTURAL EXTENSIONS

The system has evolved beyond the initial MVP. The following constraints MUST be respected:

## RECONCILIATION ENGINE (CORE)

AF is NOT code-as-source-of-truth.

All field resolution follows deterministic precedence:

override > marker > ast > code

- Overrides (design-originated intent) have highest authority
- Code is NOT absolute truth — it is one input into reconciliation
- The watcher resolves all fields via policy-based resolution

## ARTIFACT & AUDIT SYSTEM

All reconciliation steps produce deterministic artifacts:

- reconciliation status
- verification reports
- drift diffs
- run ledger
- rollback previews

These are:
- inspectable
- traceable
- CI-enforced

Agents MUST NOT bypass artifact generation or audit logging.

## CLI CONTROL SURFACE

The `af` CLI is a thin control surface:

- It delegates to watcher/server modules
- It MUST NOT implement business logic
- It MUST NOT bypass reconciliation

## DESIGN ADAPTERS (READ-ONLY)

Adapters (e.g., Figma MCP) are:

- read-only intelligence layers
- default-deny for tool access
- NEVER mutation paths

Adapters MAY:
- read tokens
- read components
- capture screenshots

Adapters MUST NOT:
- mutate Figma
- persist overrides
- make reconciliation decisions

AF remains the ONLY mutation authority.

## SYSTEM IDENTITY

AF is a deterministic reconciliation system — not:

- a code generator
- a design exporter
- a prompt-driven pipeline

Agents must preserve:
- determinism
- auditability
- runtime separation