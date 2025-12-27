// Ultra-minimal standalone backend for integram.рф
// Provides only /api/chat and /ws endpoints

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'integram-standalone' });
});

// Simple chat API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model } = req.body;

    // For now, just echo back
    res.json({
      success: true,
      response: {
        content: `Echo: ${message}`,
        model: model || 'echo',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get chat endpoint (for testing)
app.get('/api/chat', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Chat API is running',
    endpoints: {
      chat: 'POST /api/chat',
      websocket: 'ws://host/ws'
    }
  });
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
  const clientIP = request.socket.remoteAddress;
  console.log(`✅ [WebSocket] Client connected: ${clientIP}`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 [WebSocket] Received:`, message);

      // Echo back with response
      ws.send(JSON.stringify({
        type: 'response',
        data: {
          echo: message,
          timestamp: new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log(`❌ [WebSocket] Client disconnected: ${clientIP}`);
  });

  ws.on('error', (error) => {
    console.error(`⚠️  [WebSocket] Error:`, error);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Welcome to Integram WebSocket',
    timestamp: new Date().toISOString()
  }));
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname;

  console.log(`🔄 [WebSocket] Upgrade request: ${pathname}`);

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    console.log(`❌ [WebSocket] Invalid path: ${pathname}`);
    socket.destroy();
  }
});

// Start server
server.listen(PORT, HOST, () => {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Integram Standalone Backend (Minimal)                ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`🚀 Server: http://${HOST}:${PORT}`);
  console.log(`🔌 WebSocket: ws://${HOST}:${PORT}/ws`);
  console.log(`💬 Chat API: http://${HOST}:${PORT}/api/chat`);
  console.log(`❤️  Health: http://${HOST}:${PORT}/health`);
  console.log('\n✅ Server is ready!\n');
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n⚠️  ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
