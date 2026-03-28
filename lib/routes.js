const path = require('path');
const crypto = require('crypto');
const { createOtpCode, verifyOtpCode, isAuthorizedBroker, getBroker, createAccessToken, getBrokerFromToken, sendOtpEmail } = require('./auth');
const { prisma } = require('./db');
const { getClientList } = require('./sessions');

function chatBasicAuth(req, res, next) {
  const credentials = process.env.CHAT_BASIC_AUTH;
  if (!credentials) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Klokan Chat"');
    return res.status(401).send('Authentication required');
  }

  const provided = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const expected = Buffer.from(credentials);
  const actual = Buffer.from(provided);

  const valid =
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual);

  if (!valid) {
    res.set('WWW-Authenticate', 'Basic realm="Klokan Chat"');
    return res.status(401).send('Invalid credentials');
  }

  next();
}

function setupRoutes(app) {
  app.use(require('express').json());

  // ── Static pages ────────────────────────────────────────────────────────
  // embed.js is a public asset — no auth, served to external websites
  app.get('/embed.js', (_req, res) => res.sendFile(path.join(__dirname, '../public/embed.js')));
  app.get('/chat', chatBasicAuth, (_req, res) => res.sendFile(path.join(__dirname, '../public/chat.html')));
  app.get('/broker', (_req, res) => res.sendFile(path.join(__dirname, '../public/broker.html')));
  app.get('/broker/login', (_req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));
  app.get('/broker/clients', (_req, res) => res.sendFile(path.join(__dirname, '../public/clients.html')));
  app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/version', (_req, res) => res.json({ sha: process.env.COMMIT_SHA || 'dev' }));

  // ── Auth endpoints ──────────────────────────────────────────────────────

  app.post('/api/auth/request-code', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Courriel invalide.' });
      }

      const authorized = await isAuthorizedBroker(email);
      if (!authorized) {
        return res.status(403).json({ error: 'Accès non autorisé.' });
      }

      const code = await createOtpCode(email);
      await sendOtpEmail(email, code);
      res.json({ message: 'Code envoyé.' });
    } catch (err) {
      console.error('request-code error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  app.post('/api/auth/verify', async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: 'Courriel et code requis.' });
      }

      const result = await verifyOtpCode(email, code);
      if (result.error) {
        return res.status(result.status).json({ error: result.error });
      }

      const broker = await getBroker(email);
      if (!broker) {
        return res.status(403).json({ error: 'Accès non autorisé.' });
      }
      const token = createAccessToken(broker);
      res.json({ token, broker: { id: broker.id, name: broker.name, email: broker.email, role: broker.role } });
    } catch (err) {
      console.error('verify error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Non authentifié.' });
      }

      const broker = await getBrokerFromToken(authHeader.slice(7));
      if (!broker) {
        return res.status(401).json({ error: 'Token invalide.' });
      }

      const settings = await prisma.brokerSettings.upsert({
        where: { brokerId: broker.id },
        update: {},
        create: { brokerId: broker.id, language: 'fr' }
      });

      res.json({ id: broker.id, name: broker.name, email: broker.email, role: broker.role, language: settings.language });
    } catch (err) {
      console.error('me error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });
  app.patch('/api/auth/settings', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Non authentifié.' });
      }

      const broker = await getBrokerFromToken(authHeader.slice(7));
      if (!broker) {
        return res.status(401).json({ error: 'Token invalide.' });
      }

      const { language } = req.body;
      if (!language || !['fr', 'en'].includes(language)) {
        return res.status(400).json({ error: 'Langue invalide.' });
      }

      await prisma.brokerSettings.upsert({
        where: { brokerId: broker.id },
        update: { language },
        create: { brokerId: broker.id, language }
      });

      res.json({ ok: true, language });
    } catch (err) {
      console.error('settings error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  // ── Clients list ────────────────────────────────────────────────────────
  app.get('/api/clients', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Non authentifié.' });
      }
      const broker = await getBrokerFromToken(authHeader.slice(7));
      if (!broker) return res.status(401).json({ error: 'Token invalide.' });

      const clients = await getClientList(broker.id, broker.role);
      res.json(clients);
    } catch (err) {
      console.error('GET /api/clients error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });
}

module.exports = { setupRoutes };
