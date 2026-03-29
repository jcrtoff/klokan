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
  session.assignedBrokerManagerId = broker?.managerId || null;

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

// ── Archive Session ─────────────────────────────────────────────────────────

async function archiveSession(sessionId) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { archivedAt: new Date() }
  });
  sessions.delete(sessionId);
}

// ── Hard Delete Session ─────────────────────────────────────────────────────

async function hardDeleteSession(sessionId, deletedBy) {
  // Cascade handles messages and consents (onDelete: Cascade in schema)
  await prisma.session.delete({ where: { id: sessionId } });

  // Log the deletion
  await prisma.deletionLog.create({
    data: { sessionId, deletedBy }
  });

  sessions.delete(sessionId);
}

// ── Session List (from DB for completeness, filtered) ───────────────────────

async function getFilteredSessionList(brokerId, role) {
  let where;
  if (role === 'admin') {
    where = { archivedAt: null };
  } else if (role === 'manager') {
    const teamMembers = await prisma.broker.findMany({
      where: { managerId: brokerId },
      select: { id: true }
    });
    const allIds = [brokerId, ...teamMembers.map(b => b.id)];
    where = { assignedBrokerId: { in: allIds }, archivedAt: null };
  } else {
    where = { assignedBrokerId: brokerId, archivedAt: null };
  }

  const dbSessions = await prisma.session.findMany({
    where,
    include: { assignedBroker: true, controlledByBroker: true },
    orderBy: { lastActivity: 'desc' }
  });

  return dbSessions.map(s => {
    const lp = s.leadProfile || {};
    return {
      id: s.id,
      leadName: getLeadName(lp),
      leadScore: getLeadScore(lp),
      messageCount: 0, // Will be enriched from in-memory if available
      lastActivity: s.lastActivity.getTime(),
      assignedBrokerId: s.assignedBrokerId,
      assignedBrokerName: s.assignedBroker?.name || null,
      controlledByBrokerId: s.controlledByBrokerId,
      controlledByBrokerName: s.controlledByBroker?.name || null,
      budget: lp.budget || null,
      neighbourhood: lp.neighbourhood || null,
      projectType: lp.projectType || null,
      propertyType: lp.propertyType || null,
      timeline: lp.timeline || null,
      email: lp.email || null,
      phone: lp.phone || null,
      lastMessage: null,
      lastMessageRole: null
    };
  });
}

async function getClientList(brokerId, role) {
  let where;
  if (role === 'admin') {
    where = { archivedAt: null };
  } else if (role === 'manager') {
    const teamMembers = await prisma.broker.findMany({
      where: { managerId: brokerId },
      select: { id: true }
    });
    const allIds = [brokerId, ...teamMembers.map(b => b.id)];
    where = { assignedBrokerId: { in: allIds }, archivedAt: null };
  } else {
    where = { assignedBrokerId: brokerId, archivedAt: null };
  }

  const dbSessions = await prisma.session.findMany({
    where,
    include: {
      assignedBroker: true,
      _count: { select: { messages: true } }
    },
    orderBy: { lastActivity: 'desc' }
  });

  return dbSessions.map(s => {
    const p = (s.leadProfile && typeof s.leadProfile === 'object') ? s.leadProfile : {};
    const nullStr = v => (v && v !== 'null') ? v : null;
    return {
      id:                 s.id,
      leadName:           nullStr(p.name),
      leadScore:          nullStr(p.leadScore),
      email:              nullStr(p.email),
      phone:              nullStr(p.phone),
      budget:             nullStr(p.budget),
      neighbourhood:      nullStr(p.neighbourhood),
      projectType:        nullStr(p.projectType),
      propertyType:       nullStr(p.propertyType),
      timeline:           nullStr(p.timeline),
      preApproval:        nullStr(p.preApproval),
      notes:              nullStr(p.notes),
      messageCount:       s._count.messages,
      lastActivity:       s.lastActivity.getTime(),
      createdAt:          s.createdAt.getTime(),
      assignedBrokerId:   s.assignedBrokerId,
      assignedBrokerName: s.assignedBroker?.name || null
    };
  });
}

async function enrichSessionList(summaries) {
  // Enrich from in-memory cache
  for (const s of summaries) {
    const cached = sessions.get(s.id);
    if (cached) {
      s.messageCount = cached.conversation.length;
      s.leadName = getLeadName(cached.leadProfile) || s.leadName;
      s.leadScore = getLeadScore(cached.leadProfile) || s.leadScore;
      const lp = cached.leadProfile || {};
      s.budget = lp.budget || null;
      s.neighbourhood = lp.neighbourhood || null;
      s.projectType = lp.projectType || null;
      s.propertyType = lp.propertyType || null;
      s.timeline = lp.timeline || null;
      s.email = lp.email || null;
      s.phone = lp.phone || null;
      // Last message preview (any sender)
      if (cached.conversation.length > 0) {
        const last = cached.conversation[cached.conversation.length - 1];
        s.lastMessage = last.content;
        s.lastMessageRole = last.role;
      }
    } else {
      // Fallback: count + last message from DB
      const [count, lastMsg] = await Promise.all([
        prisma.message.count({ where: { sessionId: s.id } }),
        prisma.message.findFirst({ where: { sessionId: s.id }, orderBy: { createdAt: 'desc' } }),
      ]);
      s.messageCount = count;
      if (lastMsg) {
        s.lastMessage = lastMsg.content;
        s.lastMessageRole = lastMsg.role;
      }
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
    assignedBrokerManagerId: dbSession.assignedBroker?.managerId || null,
    controlledByBrokerId: dbSession.controlledByBrokerId,
    stats: {
      totalInputTokens: dbSession.totalInputTokens,
      totalOutputTokens: dbSession.totalOutputTokens,
      totalCost: dbSession.totalCost,
      responseCount: dbSession.responseCount,
      totalResponseTime: dbSession.totalResponseTime
    },
    chatClients: new Set(),
    isStreaming: false,
    rateLimitWindow: [],
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
  archiveSession,
  hardDeleteSession,
  getFilteredSessionList,
  getClientList,
  enrichSessionList,
  getInMemorySession
};
