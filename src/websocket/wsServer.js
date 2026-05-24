/**
 * WebSocket Server - Real-time streaming of token-by-token responses
 * Supports both WebSocket and Server-Sent Events (SSE)
 */

const http = require('http');
const WebSocket = require('ws');
const { bus } = require('../bus/messageBus');

class WebSocketServer {
  constructor(port = 3002) {
    this.port = port;
    this.httpServer = null;
    this.wsServer = null;
    this.clients = new Set();
    this.sseClients = new Set();
  }

  /**
   * Start the WebSocket server
   */
  start() {
    // Create HTTP server for SSE
    this.httpServer = http.createServer((req, res) => {
      // SSE endpoint
      if (req.url === '/sse' && req.method === 'GET') {
        this._handleSSE(req, res);
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'ok', 
          wsClients: this.clients.size, 
          sseClients: this.sseClients.size 
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // Create WebSocket server
    this.wsServer = new WebSocket.Server({ 
      server: this.httpServer,
      path: '/ws'
    });

    this.wsServer.on('connection', (ws) => {
      this._handleWebSocketConnection(ws);
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[WebSocketServer] Listening on http://localhost:${this.port}`);
      console.log(`[WebSocketServer] WebSocket: ws://localhost:${this.port}/ws`);
      console.log(`[WebSocketServer] SSE: http://localhost:${this.port}/sse`);
    });

    // Subscribe to agent responses for broadcasting
    bus.subscribe('agent.llm.response', (envelope) => {
      this.broadcast({
        type: 'llm.response',
        data: envelope.message
      });
    });

    bus.subscribe('orchestrator.response', (envelope) => {
      this.broadcast({
        type: 'orchestrator.response',
        data: envelope.message
      });
    });
  }

  /**
   * Stop the server
   */
  stop() {
    if (this.wsServer) {
      this.wsServer.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
    console.log('[WebSocketServer] Stopped');
  }

  /**
   * Handle WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   */
  _handleWebSocketConnection(ws) {
    this.clients.add(ws);
    console.log(`[WebSocketServer] Client connected. Total: ${this.clients.size}`);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: Date.now(),
      message: 'Connected to Future-Code Agent WebSocket server'
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        console.log('[WebSocketServer] Received:', message.type);
        
        // Forward to orchestrator
        bus.publish('orchestrator.input', {
          ...message,
          replyTo: `ws.${Date.now()}`
        });

      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid JSON'
        }));
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[WebSocketServer] Client disconnected. Total: ${this.clients.size}`);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WebSocketServer] Error:', error.message);
      this.clients.delete(ws);
    });
  }

  /**
   * Handle SSE connection
   * @param {object} req - HTTP request
   * @param {object} res - HTTP response
   */
  _handleSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const clientId = Date.now();
    this.sseClients.add({ id: clientId, res });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', id: clientId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      this.sseClients.delete({ id: clientId, res });
      console.log(`[WebSocketServer] SSE client disconnected. Total: ${this.sseClients.size}`);
    });
  }

  /**
   * Broadcast message to all WebSocket clients
   * @param {object} message - Message to broadcast
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * Send message to specific client
   * @param {string} clientId - Client identifier
   * @param {object} message - Message to send
   */
  sendToClient(clientId, message) {
    // Implementation for targeted messaging
    console.log(`[WebSocketServer] Sending to ${clientId}:`, message);
  }

  /**
   * Stream text character by character (typewriter effect)
   * @param {string} text - Text to stream
   * @param {number} delay - Delay between characters in ms
   */
  async streamText(text, delay = 50) {
    const message = { type: 'stream.start', timestamp: Date.now() };
    this.broadcast(message);

    for (let i = 0; i < text.length; i++) {
      await new Promise(resolve => setTimeout(resolve, delay));
      this.broadcast({
        type: 'stream.chunk',
        char: text[i],
        index: i,
        total: text.length
      });
    }

    this.broadcast({
      type: 'stream.end',
      timestamp: Date.now()
    });
  }

  /**
   * Get server statistics
   * @returns {object} Server stats
   */
  getStats() {
    return {
      wsClients: this.clients.size,
      sseClients: this.sseClients.size,
      port: this.port
    };
  }
}

// Singleton instance
const webSocketServer = new WebSocketServer();

module.exports = { WebSocketServer, webSocketServer };
