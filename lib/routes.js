const path = require('path');
const crypto = require('crypto');
const { createOtpCode, verifyOtpCode, isAuthorizedBroker, getBroker, createAccessToken, getBrokerFromToken, sendOtpEmail, requireRole } = require('./auth');
const { prisma } = require('./db');
const { getClientList, hardDeleteSession } = require('./sessions');

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

function renderPrivacyPage(body) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Politique de confidentialité — Klokan</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    .policy-container { max-width: 680px; margin: 0 auto; padding: 48px 24px 80px; }
    .policy-header { margin-bottom: 40px; }
    .policy-brand { font-family: 'Fraunces', serif; font-weight: 800; font-size: 22px; color: var(--teal-600); letter-spacing: -0.03em; text-decoration: none; display: inline-block; margin-bottom: 24px; }
    .policy-header h1 { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
    .policy-header .policy-updated { font-size: 13px; color: var(--text-secondary); }
    .policy-section { margin-bottom: 32px; }
    .policy-section h2 { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; }
    .policy-section p, .policy-section li { font-size: 14px; line-height: 1.7; color: var(--text-primary); }
    .policy-section ul { padding-left: 20px; margin-top: 8px; }
    .policy-section li { margin-bottom: 4px; }
    .policy-officer { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 32px; }
    .policy-officer h2 { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
    .policy-officer p { font-size: 14px; line-height: 1.7; color: var(--text-primary); margin: 0; }
    .policy-officer a { color: var(--cta-600); text-decoration: none; }
    .policy-officer a:hover { text-decoration: underline; }
    .policy-footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-secondary); text-align: center; }
  </style>
</head>
<body>
  <div class="policy-container">
    ${body}
  </div>
</body>
</html>`;
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
  app.get('/confidentialite', async (req, res) => {
    try {
      const lang = req.query.lang === 'en' ? 'en' : 'fr';
      let row = await prisma.siteContent.findUnique({ where: { key: `privacy_body_${lang}` } });
      if ((!row || !row.value) && lang === 'en') {
        row = await prisma.siteContent.findUnique({ where: { key: 'privacy_body_fr' } });
      }
      if (!row || !row.value) {
        return res.sendFile(path.join(__dirname, '../public/confidentialite.html'));
      }
      res.send(renderPrivacyPage(row.value));
    } catch {
      res.sendFile(path.join(__dirname, '../public/confidentialite.html'));
    }
  });
  app.get('/admin/incidents', (_req, res) => res.sendFile(path.join(__dirname, '../public/incidents.html')));
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

  app.patch('/api/auth/profile', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Non authentifié.' });
      }

      const broker = await getBrokerFromToken(authHeader.slice(7));
      if (!broker) {
        return res.status(401).json({ error: 'Token invalide.' });
      }

      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'Nom requis.' });
      }

      const updated = await prisma.broker.update({
        where: { id: broker.id },
        data: { name }
      });

      res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role });
    } catch (err) {
      console.error('profile error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  // ── Consent ─────────────────────────────────────────────────────────────

  app.post('/api/consent', async (req, res) => {
    try {
      const { sessionId, widgetId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId requis.' });
      }

      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) {
        return res.status(404).json({ error: 'Session introuvable.' });
      }

      await prisma.consent.create({
        data: { sessionId, widgetId: widgetId || null }
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('POST /api/consent error:', err.message);
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

  // ── Hard delete session ────────────────────────────────────────────────

  app.delete('/api/sessions/:id', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Non authentifié.' });
      }
      const broker = await getBrokerFromToken(authHeader.slice(7));
      if (!broker) return res.status(401).json({ error: 'Token invalide.' });

      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
        include: { assignedBroker: true }
      });
      if (!session) return res.status(404).json({ error: 'Session introuvable.' });

      // Permission check: admin, assigned broker, or their manager
      const canDelete =
        broker.role === 'admin' ||
        session.assignedBrokerId === broker.id ||
        (broker.role === 'manager' && session.assignedBroker?.managerId === broker.id);

      if (!canDelete) return res.status(403).json({ error: 'Accès non autorisé.' });

      await hardDeleteSession(session.id, broker.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/sessions error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  // ── Data export (portability) ──────────────────────────────────────────

  app.get('/api/admin/sessions/:id/export', requireRole('admin'), async (req, res) => {
    try {
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          consents: true
        }
      });
      if (!session) return res.status(404).json({ error: 'Session introuvable.' });

      res.json({
        session: {
          id: session.id,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          leadProfile: session.leadProfile
        },
        messages: session.messages.map(m => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt
        })),
        consents: session.consents.map(c => ({
          givenAt: c.givenAt,
          widgetId: c.widgetId
        }))
      });
    } catch (err) {
      console.error('GET /api/admin/sessions/:id/export error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  // ── Data retention cron ────────────────────────────────────────────────

  app.get('/api/cron/retention', async (req, res) => {
    try {
      const secret = req.query.secret || req.headers['x-cron-secret'];
      if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Non autorisé.' });
      }

      const { runRetention } = require('./retention');
      const result = await runRetention();
      res.json(result);
    } catch (err) {
      console.error('GET /api/cron/retention error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });
}

module.exports = { setupRoutes };
