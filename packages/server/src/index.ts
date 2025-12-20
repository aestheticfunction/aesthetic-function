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
import { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  createMessage,
  type FigmaOperation,
  type ApplyOperationsPayload,
  MessageType,
} from '@aesthetic-function/shared';
import { logBroadcast, logDesignChange, logMapUpdate, isAuditLogEnabled, flushAuditLog } from './auditLog.js';
import { loadComponentMap, mergeMapUpdate, saveComponentMap, getComponentMapPath } from './componentMap.js';

const PORT = Number(process.env.PORT ?? 3001);

// =============================================================================
// STATE
// =============================================================================

/** Connected Figma plugin clients */
const pluginClients = new Set<WebSocket>();

/** Connected watcher clients (for Design → Code relay) */
const watcherClients = new Set<WebSocket>();

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
        const data = JSON.parse(body) as {
          operations: FigmaOperation[];
          requestId?: string;
          source?: string;
          filePath?: string;
        };
        const requestId = data.requestId ?? `${Date.now()}`;
        const timestamp = new Date().toISOString();
        
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
        
        // Audit log (async, non-blocking)
        logBroadcast({
          requestId,
          messageType: MessageType.APPLY_OPERATIONS,
          source: data.source,
          filePath: data.filePath,
          // Cast to WatcherOperation[] since we know the actual shape
          operations: data.operations as unknown as Parameters<typeof logBroadcast>[0]['operations'],
          timestamp,
          clientsNotified: sent,
        });
        
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

  // Receive DESIGN_CHANGE from Figma plugin (Design → Code)
  if (req.method === 'POST' && url.pathname === '/design-change') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body) as {
          type: string;
          requestId?: string;
          timestamp?: string;
          payload: {
            nodeId: string;
            nodeName: string;
            changes: Array<{ changeType: string; value: string }>;
            source: string;
          };
        };
        
        const requestId = data.requestId ?? `design-${Date.now()}`;
        const timestamp = data.timestamp ?? new Date().toISOString();
        
        console.log(`[Server] DESIGN_CHANGE from plugin: "${data.payload.nodeName}" (${data.payload.changes.length} changes)`);
        
        // Relay to all connected watcher clients
        const messageStr = JSON.stringify({
          type: 'DESIGN_CHANGE',
          requestId,
          timestamp,
          payload: data.payload,
        });
        
        let sent = 0;
        for (const client of watcherClients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
            sent++;
          }
        }
        
        console.log(`[Server] Relayed to ${sent} watcher client(s)`);
        
        // Audit log for design→code events
        if (isAuditLogEnabled()) {
          logDesignChange({
            requestId,
            nodeName: data.payload.nodeName,
            nodeId: data.payload.nodeId,
            changes: data.payload.changes,
            timestamp,
            watchersNotified: sent,
          });
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, watchersNotified: sent, requestId }));
      } catch (err) {
        console.error('[Server] Error parsing design-change:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Receive mapping update from Figma plugin (Component Map)
  if (req.method === 'POST' && url.pathname === '/map-update') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body) as {
          baseName: string;
          componentSetNodeId?: string;
          variantState: string | null;
          variantNodeId: string;
        };
        
        // Validate required fields
        if (!data.baseName || typeof data.baseName !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid baseName' }));
          return;
        }
        if (!data.variantNodeId || typeof data.variantNodeId !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid variantNodeId' }));
          return;
        }
        
        const timestamp = new Date().toISOString();
        console.log(`[Server] MAP_UPDATE: ${data.baseName}${data.variantState ? '::' + data.variantState : ''} → ${data.variantNodeId}`);
        
        // Load existing map, merge update, and save if changed
        const existing = await loadComponentMap();
        const { map, changed } = mergeMapUpdate(existing, {
          baseName: data.baseName,
          componentSetNodeId: data.componentSetNodeId,
          variantState: data.variantState,
          variantNodeId: data.variantNodeId,
        });
        
        if (changed) {
          await saveComponentMap(map);
          console.log(`[Server] ✓ Updated component-map.json`);
          
          // Audit log for map updates
          logMapUpdate({
            baseName: data.baseName,
            variantState: data.variantState,
            variantNodeId: data.variantNodeId,
            componentSetNodeId: data.componentSetNodeId,
            timestamp,
            mapPath: getComponentMapPath(),
          });
        } else {
          console.log(`[Server] No change to component-map.json (idempotent)`);
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, changed }));
      } catch (err) {
        console.error('[Server] Error handling map-update:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update component map' }));
      }
    });
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// =============================================================================
// WEBSOCKET SERVERS
// =============================================================================

// Plugin WebSocket server (for Figma plugin)
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  console.log(`[Server] Plugin client connected from ${req.socket.remoteAddress}`);
  pluginClients.add(ws);

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[Server] Received from plugin:`, msg.type);
      
      // Handle OPERATION_RESULT from plugin (Phase 9C observability)
      if (msg.type === 'OPERATION_RESULT' && msg.payload) {
        const { originRequestId, success, error, createdNodeIds } = msg.payload as {
          originRequestId: string;
          success: boolean;
          error?: string;
          createdNodeIds?: Record<string, string>;
        };
        
        if (success) {
          const createdCount = createdNodeIds ? Object.keys(createdNodeIds).length : 0;
          console.log(`[Server] ✓ OPERATION_RESULT success for requestId=${originRequestId}${createdCount > 0 ? ` (created ${createdCount} node(s))` : ''}`);
        } else {
          // Log failure prominently for debugging
          console.error(`[Server] ✗ OPERATION_RESULT failed for requestId=${originRequestId}`);
          if (error) {
            console.error(`[Server]   Error: ${error}`);
          }
          // Log to audit if enabled
          if (isAuditLogEnabled()) {
            const timestamp = new Date().toISOString();
            logBroadcast({
              requestId: `result-${originRequestId}`,
              messageType: 'OPERATION_RESULT_FAILED',
              source: 'plugin',
              operations: [],
              timestamp,
              clientsNotified: 0,
            });
          }
        }
      }
      
      // Handle DESIGN_CHANGE from plugin via WebSocket
      if (msg.type === 'DESIGN_CHANGE' && msg.payload) {
        const requestId = msg.requestId ?? `design-${Date.now()}`;
        const timestamp = msg.timestamp ?? new Date().toISOString();
        
        console.log(`[Server] DESIGN_CHANGE via WS: "${msg.payload.nodeName}" (${msg.payload.changes.length} changes)`);
        
        // Relay to all connected watcher clients
        const messageStr = JSON.stringify({
          type: 'DESIGN_CHANGE',
          requestId,
          timestamp,
          payload: msg.payload,
        });
        
        let sent = 0;
        for (const client of watcherClients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
            sent++;
          }
        }
        
        console.log(`[Server] Relayed to ${sent} watcher client(s)`);
        
        // Audit log
        if (isAuditLogEnabled()) {
          logDesignChange({
            requestId,
            nodeName: msg.payload.nodeName,
            nodeId: msg.payload.nodeId,
            changes: msg.payload.changes,
            timestamp,
            watchersNotified: sent,
          });
        }
      }
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

// Watcher WebSocket server (for Design → Code relay)
const wssWatcher = new WebSocketServer({ noServer: true });

wssWatcher.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  console.log(`[Server] Watcher client connected from ${req.socket.remoteAddress}`);
  watcherClients.add(ws);

  ws.on('close', () => {
    console.log('[Server] Watcher client disconnected');
    watcherClients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[Server] Watcher WebSocket error:', err);
    watcherClients.delete(ws);
  });

  // Send welcome message
  ws.send(JSON.stringify({ type: 'CONNECTED', version: PROTOCOL_VERSION }));
});

// Handle WebSocket upgrade requests manually
httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
  const pathname = new URL(request.url ?? '/', `http://localhost:${PORT}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/ws-watcher') {
    wssWatcher.handleUpgrade(request, socket, head, (ws) => {
      wssWatcher.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// =============================================================================
// START SERVER
// =============================================================================

httpServer.listen(PORT, () => {
  console.log(`[Server] Protocol version: ${PROTOCOL_VERSION}`);
  console.log(`[Server] HTTP server listening on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket (plugin): ws://localhost:${PORT}/ws`);
  console.log(`[Server] WebSocket (watcher): ws://localhost:${PORT}/ws-watcher`);
  console.log(`[Server] Polling endpoint: GET http://localhost:${PORT}/poll`);
  console.log(`[Server] Test endpoint: POST http://localhost:${PORT}/test`);
  console.log(`[Server] Design change: POST http://localhost:${PORT}/design-change`);
  console.log(`[Server] Map update: POST http://localhost:${PORT}/map-update`);
  console.log(`[Server] Audit log: ${isAuditLogEnabled() ? 'ENABLED (sync-log.md)' : 'disabled'}`);
  console.log(`[Server] Component map: ${getComponentMapPath()}`);
  console.log('');
  console.log('[Server] For Figma plugin access, expose via tunnel:');
  console.log(`  npx cloudflared tunnel --url http://localhost:${PORT}`);
  console.log('  or: ngrok http ${PORT}');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...');
  await flushAuditLog();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Server] Shutting down...');
  await flushAuditLog();
  process.exit(0);
});
