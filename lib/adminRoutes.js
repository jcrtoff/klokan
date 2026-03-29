const { requireRole } = require('./auth');
const { prisma } = require('./db');

function setupAdminRoutes(app) {
  // ── Admin: manage managers ────────────────────────────────────────────────

  app.get('/api/admin/managers', requireRole('admin'), async (req, res) => {
    try {
      const managers = await prisma.broker.findMany({
        where: { role: 'manager' },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true },
        orderBy: { createdAt: 'asc' }
      });
      res.json(managers);
    } catch (err) {
      console.error('GET /api/admin/managers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/admin/managers', requireRole('admin'), async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'email_invalid' });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name_required' });
      }
      const existing = await prisma.broker.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        if (existing.role !== 'broker') {
          return res.status(409).json({ error: 'email_already_registered' });
        }
        // Promote existing broker to manager
        const manager = await prisma.broker.update({
          where: { id: existing.id },
          data: { name: name.trim(), role: 'manager', authorized: true },
          select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true }
        });
        return res.status(200).json(manager);
      }
      const manager = await prisma.broker.create({
        data: { email: email.toLowerCase(), name: name.trim(), role: 'manager', authorized: true },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true }
      });
      res.status(201).json(manager);
    } catch (err) {
      console.error('POST /api/admin/managers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.delete('/api/admin/managers/:id', requireRole('admin'), async (req, res) => {
    try {
      const manager = await prisma.broker.findUnique({ where: { id: req.params.id } });
      if (!manager || manager.role !== 'manager') {
        return res.status(404).json({ error: 'not_found' });
      }
      await prisma.broker.update({ where: { id: req.params.id }, data: { authorized: false } });
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/admin/managers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Admin: list admins (read-only) ─────────────────────────────────────────

  app.get('/api/admin/admins', requireRole('admin'), async (req, res) => {
    try {
      const admins = await prisma.broker.findMany({
        where: { role: 'admin' },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true },
        orderBy: { createdAt: 'asc' }
      });
      res.json(admins);
    } catch (err) {
      console.error('GET /api/admin/admins error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Admin: manage solo brokers ─────────────────────────────────────────────

  app.get('/api/admin/brokers', requireRole('admin'), async (req, res) => {
    try {
      const brokers = await prisma.broker.findMany({
        where: { role: 'broker', managerId: null },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true },
        orderBy: { createdAt: 'asc' }
      });
      res.json(brokers);
    } catch (err) {
      console.error('GET /api/admin/brokers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/admin/brokers', requireRole('admin'), async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'email_invalid' });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name_required' });
      }
      const existing = await prisma.broker.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        return res.status(409).json({ error: 'email_already_registered' });
      }
      const broker = await prisma.broker.create({
        data: { email: email.toLowerCase(), name: name.trim(), role: 'broker', authorized: true },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true }
      });
      res.status(201).json(broker);
    } catch (err) {
      console.error('POST /api/admin/brokers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.delete('/api/admin/brokers/:id', requireRole('admin'), async (req, res) => {
    try {
      const broker = await prisma.broker.findUnique({ where: { id: req.params.id } });
      if (!broker || broker.role !== 'broker' || broker.managerId !== null) {
        return res.status(404).json({ error: 'not_found' });
      }
      await prisma.broker.update({ where: { id: req.params.id }, data: { authorized: false } });
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/admin/brokers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Manager: manage their team ────────────────────────────────────────────

  app.get('/api/manager/brokers', requireRole('manager'), async (req, res) => {
    try {
      const brokers = await prisma.broker.findMany({
        where: { managerId: req.broker.id, role: 'broker' },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true },
        orderBy: { createdAt: 'asc' }
      });
      res.json(brokers);
    } catch (err) {
      console.error('GET /api/manager/brokers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/manager/brokers', requireRole('manager'), async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'email_invalid' });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name_required' });
      }
      const existing = await prisma.broker.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        return res.status(409).json({ error: 'email_already_registered' });
      }
      const broker = await prisma.broker.create({
        data: { email: email.toLowerCase(), name: name.trim(), role: 'broker', authorized: true, managerId: req.broker.id },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true }
      });
      res.status(201).json(broker);
    } catch (err) {
      console.error('POST /api/manager/brokers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.delete('/api/manager/brokers/:id', requireRole('manager'), async (req, res) => {
    try {
      const broker = await prisma.broker.findUnique({ where: { id: req.params.id } });
      if (!broker || broker.role !== 'broker' || broker.managerId !== req.broker.id) {
        return res.status(404).json({ error: 'not_found' });
      }
      await prisma.broker.update({ where: { id: req.params.id }, data: { authorized: false } });
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/manager/brokers error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Site content (public read) ─────────────────────────────────────────

  const CONSENT_KEYS = ['consent_main_text', 'consent_withdrawal', 'consent_accept_btn', 'consent_decline_btn'];
  const ALL_SITE_KEYS = [...CONSENT_KEYS, 'privacy_body'];

  app.get('/api/site-content/consent', async (req, res) => {
    try {
      const lang = req.query.lang === 'en' ? 'en' : 'fr';
      const keys = CONSENT_KEYS.map(k => `${k}_${lang}`);
      const rows = await prisma.siteContent.findMany({ where: { key: { in: keys } } });
      const result = {};
      for (const k of CONSENT_KEYS) {
        const row = rows.find(r => r.key === `${k}_${lang}`);
        result[k] = row?.value || '';
      }
      // Fall back to FR if EN values are empty
      if (lang === 'en' && Object.values(result).some(v => !v)) {
        const frKeys = CONSENT_KEYS.map(k => `${k}_fr`);
        const frRows = await prisma.siteContent.findMany({ where: { key: { in: frKeys } } });
        for (const k of CONSENT_KEYS) {
          if (!result[k]) {
            const fr = frRows.find(r => r.key === `${k}_fr`);
            result[k] = fr?.value || '';
          }
        }
      }
      res.json(result);
    } catch (err) {
      console.error('GET /api/site-content/consent error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.get('/api/site-content/privacy', async (req, res) => {
    try {
      const lang = req.query.lang === 'en' ? 'en' : 'fr';
      let row = await prisma.siteContent.findUnique({ where: { key: `privacy_body_${lang}` } });
      // Fall back to FR if EN is empty
      if ((!row || !row.value) && lang === 'en') {
        row = await prisma.siteContent.findUnique({ where: { key: 'privacy_body_fr' } });
      }
      res.json({ privacy_body: row?.value || '' });
    } catch (err) {
      console.error('GET /api/site-content/privacy error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Site content (admin write) ────────────────────────────────────────

  app.put('/api/admin/site-content', requireRole('admin'), async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || typeof value !== 'string') {
        return res.status(400).json({ error: 'missing_fields' });
      }
      // Validate key format: must be a known key with _fr or _en suffix
      const base = key.replace(/_(fr|en)$/, '');
      const lang = key.match(/_(fr|en)$/)?.[1];
      if (!lang || !ALL_SITE_KEYS.includes(base)) {
        return res.status(400).json({ error: 'invalid_key' });
      }
      const record = await prisma.siteContent.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      });
      res.json(record);
    } catch (err) {
      console.error('PUT /api/admin/site-content error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Admin: incident log ───────────────────────────────────────────────

  app.get('/api/admin/incidents', requireRole('admin'), async (req, res) => {
    try {
      const incidents = await prisma.incident.findMany({
        orderBy: { occurredAt: 'desc' }
      });
      res.json(incidents);
    } catch (err) {
      console.error('GET /api/admin/incidents error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/admin/incidents', requireRole('admin'), async (req, res) => {
    try {
      const { occurredAt, discoveredAt, description, affectedSessions, riskLevel, reportedToCAI, reportedAt, actionsTaken } = req.body;

      if (!occurredAt || !discoveredAt || !description || !riskLevel) {
        return res.status(400).json({ error: 'missing_fields' });
      }
      if (!['low', 'medium', 'high'].includes(riskLevel)) {
        return res.status(400).json({ error: 'invalid_risk_level' });
      }

      const incident = await prisma.incident.create({
        data: {
          occurredAt: new Date(occurredAt),
          discoveredAt: new Date(discoveredAt),
          description,
          affectedSessions: affectedSessions || [],
          riskLevel,
          reportedToCAI: reportedToCAI || false,
          reportedAt: reportedAt ? new Date(reportedAt) : null,
          actionsTaken: actionsTaken || ''
        }
      });
      res.status(201).json(incident);
    } catch (err) {
      console.error('POST /api/admin/incidents error:', err.message);
      res.status(500).json({ error: 'internal_error' });
    }
  });
}

module.exports = { setupAdminRoutes };
