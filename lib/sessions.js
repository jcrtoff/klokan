const { prisma } = require('./db');

// In-memory cache of active sessions (hot state for WS connections)
const sessions = new Map();

// ── Create Session ──────────────────────────────────────────────────────────

async function createSession(assignedBrokerId = null) {
  const dbSession = await prisma.session.create({
    data: { assignedBrokerId },
    include: { assignedBroker: true }
  });

  const session = dbToMemory(dbSession);
  sessions.set(session.id, session);
  return session;
}

// ── Load Session (from DB if not in memory) ─────────────────────────────────

async function getSession(id) {
  if (sessions.has(id)) return sessions.get(id);

  const dbSession = await prisma.session.findUnique({
    where: { id },
    include: {
      assignedBroker: true,
      controlledByBroker: true,
      messages: { orderBy: { createdAt: 'asc' } }
    }
  });

  if (!dbSession) return null;

  const session = dbToMemory(dbSession);
  // Rebuild conversation from DB messages
  session.conversation = dbSession.messages.map(m => ({
    role: m.role,
    content: m.content,
    displayRole: m.role === 'assistant' ? undefined : m.role,
    brokerName: m.broker?.name || null,
    brokerId: m.brokerId,
    timestamp: m.createdAt.getTime()
  }));

  sessions.set(session.id, session);
  return session;
}

// ── Save Message ────────────────────────────────────────────────────────────

async function saveMessage(session, entry) {
  session.conversation.push(entry);
  session.lastActivity = Date.now();

  await prisma.message.create({
    data: {
      sessionId: session.id,
      role: entry.role,
      content: entry.content,
      brokerId: entry.brokerId || null
    }
  });

  await prisma.session.update({
    where: { id: session.id },
    data: { lastActivity: new Date() }
  });
}

// ── Update Lead Profile ─────────────────────────────────────────────────────

async function updateLeadProfile(session, profile) {
  session.leadProfile = profile;
  await prisma.session.update({
    where: { id: session.id },
    data: { leadProfile: profile }
  });
}

// ── Update Stats ────────────────────────────────────────────────────────────

async function updateStats(session, inputTokens, outputTokens, cost, responseTime) {
  session.stats.totalInputTokens += inputTokens;
  session.stats.totalOutputTokens += outputTokens;
  session.stats.totalCost += cost;
  session.stats.responseCount += 1;
  session.stats.totalResponseTime += responseTime;

  await prisma.session.update({
    where: { id: session.id },
    data: {
      totalInputTokens: session.stats.totalInputTokens,
      totalOutputTokens: session.stats.totalOutputTokens,
      totalCost: session.stats.totalCost,
      responseCount: session.stats.responseCount,
      totalResponseTime: session.stats.totalResponseTime
    }
  });
}

// ── Assign / Claim / Control ────────────────────────────────────────────────

async function assignBroker(session, brokerId) {
  session.assignedBrokerId = brokerId;
  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  session.assignedBrokerName = broker?.name || null;

  await prisma.session.update({
    where: { id: session.id },
    data: { assignedBrokerId: brokerId }
  });
  return broker;
}

async function setControlledBy(session, brokerId) {
  session.controlledByBrokerId = brokerId;
  await prisma.session.update({
    where: { id: session.id },
    data: { controlledByBrokerId: brokerId }
  });
}

// ── Session List (from DB for completeness, filtered) ───────────────────────

async function getFilteredSessionList(brokerId, role) {
  const where = role === 'manager'
    ? {}
    : { OR: [{ assignedBrokerId: null }, { assignedBrokerId: brokerId }] };

  const dbSessions = await prisma.session.findMany({
    where,
    include: { assignedBroker: true, controlledByBroker: true },
    orderBy: { lastActivity: 'desc' }
  });

  return dbSessions.map(s => ({
    id: s.id,
    leadName: getLeadName(s.leadProfile),
    leadScore: getLeadScore(s.leadProfile),
    messageCount: 0, // Will be enriched from in-memory if available
    lastActivity: s.lastActivity.getTime(),
    assignedBrokerId: s.assignedBrokerId,
    assignedBrokerName: s.assignedBroker?.name || null,
    controlledByBrokerId: s.controlledByBrokerId,
    controlledByBrokerName: s.controlledByBroker?.name || null
  }));
}

async function enrichSessionList(summaries) {
  // Enrich message counts from in-memory cache
  for (const s of summaries) {
    const cached = sessions.get(s.id);
    if (cached) {
      s.messageCount = cached.conversation.length;
      s.leadName = getLeadName(cached.leadProfile) || s.leadName;
      s.leadScore = getLeadScore(cached.leadProfile) || s.leadScore;
    } else {
      // Fallback: count from DB
      s.messageCount = await prisma.message.count({ where: { sessionId: s.id } });
    }
  }
  return summaries;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function dbToMemory(dbSession) {
  return {
    id: dbSession.id,
    conversation: [],
    leadProfile: dbSession.leadProfile || {},
    assignedBrokerId: dbSession.assignedBrokerId,
    assignedBrokerName: dbSession.assignedBroker?.name || null,
    controlledByBrokerId: dbSession.controlledByBrokerId,
    stats: {
      totalInputTokens: dbSession.totalInputTokens,
      totalOutputTokens: dbSession.totalOutputTokens,
      totalCost: dbSession.totalCost,
      responseCount: dbSession.responseCount,
      totalResponseTime: dbSession.totalResponseTime
    },
    chatClients: new Set(),
    createdAt: dbSession.createdAt.getTime(),
    lastActivity: dbSession.lastActivity.getTime()
  };
}

function getLeadName(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const name = profile.name;
  return (name && name !== 'null') ? name : null;
}

function getLeadScore(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const score = profile.leadScore;
  return (score && score !== 'null') ? score : null;
}

function getInMemorySession(id) {
  return sessions.get(id);
}

module.exports = {
  sessions,
  createSession,
  getSession,
  saveMessage,
  updateLeadProfile,
  updateStats,
  assignBroker,
  setControlledBy,
  getFilteredSessionList,
  enrichSessionList,
  getInMemorySession
};
