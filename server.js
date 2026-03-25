const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const express = require('express');
const path = require('path');

const { setupRoutes } = require('./lib/routes');
const { setupWebSocket } = require('./lib/websocket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──────────────────────────────────────────────────────────────────
setupRoutes(app);

// ── WebSocket ───────────────────────────────────────────────────────────────
setupWebSocket(server);

// ── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`RodCast server running on http://localhost:${PORT}`);
  console.log(`  Chat: http://localhost:${PORT}/chat`);
  console.log(`  Broker: http://localhost:${PORT}/broker`);
  console.log(`  SHA: ${process.env.COMMIT_SHA || 'dev'}`);
});
