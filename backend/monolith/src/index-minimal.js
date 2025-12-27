// Minimal Integram Backend Server for integram-standalone
import './config/env.js';

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import chatRoutes from './api/routes/chat.js';
import generalChatRoutes from './api/routes/general-chat.js';
import authRoutes from './api/routes/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'integram-standalone-backend' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/general-chat', generalChatRoutes);

// Create HTTP server
const server = http.createServer(app);

// WebSocket server for /ws endpoint
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
  console.log('✅ WebSocket client connected from:', request.socket.remoteAddress);

  ws.on('message', (message) => {
    console.log('📨 Received:', message.toString());
    // Echo back for now
    ws.send(JSON.stringify({
      type: 'pong',
      message: 'WebSocket connected',
      timestamp: new Date().toISOString()
    }));
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Integram WebSocket',
    timestamp: new Date().toISOString()
  }));
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Start server
server.listen(PORT, HOST, () => {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Integram Standalone Backend - Minimal Version        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  console.log(`✅ WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
  console.log(`✅ Health check: http://${HOST}:${PORT}/health`);
  console.log(`✅ Chat API: http://${HOST}:${PORT}/api/chat`);
  console.log('\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
