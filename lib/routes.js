const path = require('path');
const { createOtpCode, verifyOtpCode, isAuthorizedBroker, getBroker, createAccessToken, getBrokerFromToken, sendOtpEmail } = require('./auth');

function setupRoutes(app) {
  app.use(require('express').json());

  // ── Static pages ────────────────────────────────────────────────────────
  app.get('/chat', (_req, res) => res.sendFile(path.join(__dirname, '../public/chat.html')));
  app.get('/broker', (_req, res) => res.sendFile(path.join(__dirname, '../public/broker.html')));
  app.get('/broker/login', (_req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));
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

      res.json({ id: broker.id, name: broker.name, email: broker.email, role: broker.role });
    } catch (err) {
      console.error('me error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });
}

module.exports = { setupRoutes };
