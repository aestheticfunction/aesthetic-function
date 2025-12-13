/**
 * @aesthetic-function/server
 *
 * RUNTIME: Node.js (local or tunneled)
 * RESPONSIBILITIES:
 *   - Relays messages between Watcher and Figma Plugin
 *   - Owns logging, audit, and persistence
 *   - Does NOT interpret UI meaning
 *
 * CAN: Access disk and network
 * CANNOT: Mutate Figma Scene Graph directly
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  createMessage,
  type FigmaOperation,
  type ApplyOperationsPayload,
  MessageType,
} from '@aesthetic-function/shared';

const PORT = Number(process.env.PORT ?? 3001);

// =============================================================================
// STATE
// =============================================================================

/** Connected Figma plugin clients */
const pluginClients = new Set<WebSocket>();

/** Latest operations for polling fallback */
let latestOperations: { requestId: string; operations: FigmaOperation[] } | null = null;

/** Track last polled request ID per client to avoid duplicates */
const polledRequestIds = new Set<string>();

// =============================================================================
// HTTP SERVER
// =============================================================================

/**
 * Simple HTTP server for:
 * - GET /health - health check
 * - GET /poll - polling fallback for Figma plugin
 * - POST /test - send test operations (for CLI testing)
 * - POST /operations - receive operations from watcher
 */
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS headers for Figma plugin iframe
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: PROTOCOL_VERSION, clients: pluginClients.size }));
    return;
  }

  // Polling fallback for Figma plugin
  if (req.method === 'GET' && url.pathname === '/poll') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    
    if (latestOperations && !polledRequestIds.has(latestOperations.requestId)) {
      polledRequestIds.add(latestOperations.requestId);
      // Keep polled IDs set small
      if (polledRequestIds.size > 100) {
        const first = polledRequestIds.values().next().value;
        if (first) polledRequestIds.delete(first);
      }
      res.end(JSON.stringify({ operations: latestOperations.operations, requestId: latestOperations.requestId }));
    } else {
      res.end(JSON.stringify({ operations: [] }));
    }
    return;
  }

  // Receive operations from watcher or test sender
  if (req.method === 'POST' && (url.pathname === '/operations' || url.pathname === '/test')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body) as { operations: FigmaOperation[]; requestId?: string };
        const requestId = data.requestId ?? `${Date.now()}`;
        
        console.log(`[Server] Received ${data.operations.length} operation(s), requestId: ${requestId}`);
        
        // Store for polling
        latestOperations = { requestId, operations: data.operations };
        
        // Broadcast to all connected WebSocket clients
        const message = createMessage<typeof MessageType.APPLY_OPERATIONS, ApplyOperationsPayload>(
          MessageType.APPLY_OPERATIONS,
          { operations: data.operations, originRequestId: requestId }
        );
        const messageStr = JSON.stringify(message);
        
        let sent = 0;
        for (const client of pluginClients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
            sent++;
          }
        }
        
        console.log(`[Server] Broadcast to ${sent} WebSocket client(s)`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, clientsNotified: sent, requestId }));
      } catch (err) {
        console.error('[Server] Error parsing request:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// =============================================================================
// WEBSOCKET SERVER
// =============================================================================

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  console.log(`[Server] WebSocket client connected from ${req.socket.remoteAddress}`);
  pluginClients.add(ws);

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[Server] Received from plugin:`, msg.type);
      
      // Handle plugin messages (e.g., OPERATION_RESULT, PLUGIN_READY)
      // For now, just log them
    } catch (err) {
      console.error('[Server] Invalid message from plugin:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Server] WebSocket client disconnected');
    pluginClients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[Server] WebSocket error:', err);
    pluginClients.delete(ws);
  });

  // Send welcome message
  ws.send(JSON.stringify(createMessage('CONNECTED', { version: PROTOCOL_VERSION })));
});

// =============================================================================
// START SERVER
// =============================================================================

httpServer.listen(PORT, () => {
  console.log(`[Server] Protocol version: ${PROTOCOL_VERSION}`);
  console.log(`[Server] HTTP server listening on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`[Server] Polling endpoint: GET http://localhost:${PORT}/poll`);
  console.log(`[Server] Test endpoint: POST http://localhost:${PORT}/test`);
  console.log('');
  console.log('[Server] For Figma plugin access, expose via tunnel:');
  console.log(`  npx cloudflared tunnel --url http://localhost:${PORT}`);
  console.log('  or: ngrok http ${PORT}');
});
