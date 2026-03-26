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
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  app.post('/api/admin/managers', requireRole('admin'), async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Courriel invalide.' });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Nom requis.' });
      }
      const existing = await prisma.broker.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        return res.status(409).json({ error: 'Ce courriel est déjà enregistré.' });
      }
      const manager = await prisma.broker.create({
        data: { email: email.toLowerCase(), name: name.trim(), role: 'manager', authorized: true },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true }
      });
      res.status(201).json(manager);
    } catch (err) {
      console.error('POST /api/admin/managers error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  app.delete('/api/admin/managers/:id', requireRole('admin'), async (req, res) => {
    try {
      const manager = await prisma.broker.findUnique({ where: { id: req.params.id } });
      if (!manager || manager.role !== 'manager') {
        return res.status(404).json({ error: 'Gestionnaire introuvable.' });
      }
      await prisma.broker.update({ where: { id: req.params.id }, data: { authorized: false } });
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/admin/managers error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
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
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  app.post('/api/manager/brokers', requireRole('manager'), async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Courriel invalide.' });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Nom requis.' });
      }
      const existing = await prisma.broker.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        return res.status(409).json({ error: 'Ce courriel est déjà enregistré.' });
      }
      const broker = await prisma.broker.create({
        data: { email: email.toLowerCase(), name: name.trim(), role: 'broker', authorized: true, managerId: req.broker.id },
        select: { id: true, email: true, name: true, authorized: true, createdAt: true, lastLogin: true }
      });
      res.status(201).json(broker);
    } catch (err) {
      console.error('POST /api/manager/brokers error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });

  app.delete('/api/manager/brokers/:id', requireRole('manager'), async (req, res) => {
    try {
      const broker = await prisma.broker.findUnique({ where: { id: req.params.id } });
      if (!broker || broker.role !== 'broker' || broker.managerId !== req.broker.id) {
        return res.status(404).json({ error: 'Courtier introuvable.' });
      }
      await prisma.broker.update({ where: { id: req.params.id }, data: { authorized: false } });
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/manager/brokers error:', err.message);
      res.status(500).json({ error: 'Erreur interne.' });
    }
  });
}

module.exports = { setupAdminRoutes };
