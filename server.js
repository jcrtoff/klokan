const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const express = require('express');
const path = require('path');

const { setupRoutes } = require('./lib/routes');
const { setupAdminRoutes } = require('./lib/adminRoutes');
const { setupWebSocket } = require('./lib/websocket');
const { ensureAdminsExist } = require('./lib/auth');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──────────────────────────────────────────────────────────────────
setupRoutes(app);
setupAdminRoutes(app);

// ── WebSocket ───────────────────────────────────────────────────────────────
setupWebSocket(server);

// ── Start ───────────────────────────────────────────────────────────────────
ensureAdminsExist().then(() => {
  server.listen(PORT, () => {
    console.log(`Klokan server running on http://localhost:${PORT}`);
    console.log(`  Chat: http://localhost:${PORT}/chat`);
    console.log(`  Broker: http://localhost:${PORT}/broker`);
    console.log(`  Admin: http://localhost:${PORT}/admin`);
    console.log(`  SHA: ${process.env.COMMIT_SHA || 'dev'}`);
  });
}).catch(err => {
  console.error('Failed to seed admins:', err.message);
  process.exit(1);
});
