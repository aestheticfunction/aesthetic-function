---
agent: agent
---
I am building a Code → Design synchronization system based on a provisional patent for an AI-Driven UX Workflow.

Goal
Updating a local React component (text, color, layout) automatically updates the corresponding element in an open Figma file.

Architecture
Create a TypeScript monorepo with three packages and one shared protocol package.

⸻

Required Packages

1. /packages/shared
	•	Contains protocol.ts
	•	Defines:
	•	MessageEnvelope
	•	IntentModel
	•	FigmaOperation

⸻

2. /packages/server
	•	Node.js + socket.io (or WebSocket)
	•	Runs on configurable SERVER_URL
	•	Responsibilities:
	•	Receive messages from Watcher
	•	Relay messages to Figma Plugin UI
	•	Log synchronization events (async)

⸻

3. /packages/figma-plugin
	•	Standard Figma plugin structure
	•	ui.html
	•	Connects to SERVER_URL
	•	Supports polling fallback
	•	Passes messages to code.ts
	•	code.ts
	•	Receives FigmaOperation[]
	•	Finds nodes by name or selection
	•	Updates:
	•	fills
	•	characters
	•	AutoLayout properties

⸻

4. /packages/watcher
	•	Node.js script
	•	Uses chokidar to watch a demo React app
	•	On file change:
	1.	Read file content
	2.	Call analyzeCodeWithLLM(code)
	3.	Convert result → FigmaOperation[]
	4.	Emit via protocol envelope

IMPORTANT
	•	analyzeCodeWithLLM is a placeholder
	•	For MVP, mock or regex-parse
	•	Structure it for later LLM replacement

⸻

Execution Order
	1.	Create monorepo + package.json files
	2.	Build shared protocol
	3.	Build server
	4.	Build figma plugin
	5.	Build watcher

Generate:
	•	Setup commands
	•	Core source files
	•	Clear TODO comments for Phase 2

Do not overbuild. MVP first.