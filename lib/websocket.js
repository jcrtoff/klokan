const { WebSocketServer } = require('ws');
const { getBrokerFromToken } = require('./auth');
const { prisma } = require('./db');
const { createSession, getSession, saveMessage, updateLeadProfile, updateStats, assignBroker, setControlledBy, getFilteredSessionList, enrichSessionList } = require('./sessions');
const { calculateCost, CHAT_MODEL, DEFAULT_BROKER_NAME, streamChatResponse, extractLeadProfile } = require('./claude');

const brokerClients = new Set();

function broadcast(clients, data) {
  const json = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) client.send(json);
  }
}

function getBrokerClientsForSession(session) {
  const clients = new Set();
  for (const client of brokerClients) {
    if (client.brokerRole === 'manager') {
      if (
        session.assignedBrokerId === client.brokerId ||
        session.assignedBrokerManagerId === client.brokerId
      ) {
        clients.add(client);
      }
    } else if (session.assignedBrokerId === client.brokerId) {
      clients.add(client);
    }
  }
  return clients;
}

async function broadcastSessionList() {
  for (const client of brokerClients) {
    if (client.readyState !== 1) continue;
    const summaries = await getFilteredSessionList(client.brokerId, client.brokerRole);
    const enriched = await enrichSessionList(summaries);
    client.send(JSON.stringify({ type: 'session_list', sessions: enriched }));
  }
}

function sendSessionState(ws, session) {
  ws.send(JSON.stringify({ type: 'lead_update', profile: session.leadProfile, sessionId: session.id }));
  ws.send(JSON.stringify({
    type: 'broker_control',
    active: !!session.controlledByBrokerId,
    controlledByBrokerId: session.controlledByBrokerId,
    sessionId: session.id
  }));
  ws.send(JSON.stringify({ type: 'session_stats', stats: session.stats, sessionId: session.id }));

  for (const entry of session.conversation) {
    ws.send(JSON.stringify({
      type: 'message',
      role: entry.role === 'assistant' ? 'ai' : entry.displayRole || entry.role,
      content: entry.content,
      brokerName: entry.brokerName,
      timestamp: entry.timestamp,
      sessionId: session.id
    }));
  }
}

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'identify':
          await handleIdentify(ws, msg);
          break;

        case 'user_message': {
          const session = await getSession(ws.sessionId);
          if (session) await handleUserMessage(session, msg.content);
          break;
        }

        case 'broker_message': {
          const session = await getSession(msg.sessionId);
          if (session && ws.brokerId) await handleBrokerMessage(session, msg.content, ws.brokerId, ws.brokerName);
          break;
        }

        case 'broker_control': {
          const session = await getSession(msg.sessionId);
          if (session) {
            const brokerId = msg.active ? ws.brokerId : null;
            await setControlledBy(session, brokerId);
            broadcast(session.chatClients, {
              type: 'broker_control',
              active: !!brokerId,
              sessionId: session.id
            });
            await broadcastSessionList();
          }
          break;
        }

        case 'broker_typing': {
          const session = await getSession(msg.sessionId);
          if (session) {
            broadcast(session.chatClients, { type: 'broker_typing', isTyping: msg.isTyping });
          }
          break;
        }

        case 'broker_claim': {
          const session = await getSession(msg.sessionId);
          if (session && !session.assignedBrokerId && ws.brokerId) {
            await assignBroker(session, ws.brokerId);
            await broadcastSessionList();
          }
          break;
        }

        case 'manager_assign_broker': {
          if (ws.brokerRole !== 'manager') break;
          const session = await getSession(msg.sessionId);
          if (session && msg.brokerId) {
            await assignBroker(session, msg.brokerId);
            await broadcastSessionList();
          }
          break;
        }

        case 'select_session': {
          const session = await getSession(msg.sessionId);
          if (session) sendSessionState(ws, session);
          break;
        }
      }
    });

    ws.on('close', async () => {
      if (ws.role === 'chat' && ws.sessionId) {
        const session = await getSession(ws.sessionId);
        if (session) {
          session.chatClients.delete(ws);
          await broadcastSessionList();
        }
      }
      if (ws.role === 'broker') {
        brokerClients.delete(ws);
      }
    });
  });
}

// ── Identify Handler ────────────────────────────────────────────────────────

async function handleIdentify(ws, msg) {
  if (msg.role === 'chat') {
    let session;
    if (msg.sessionId) {
      session = await getSession(msg.sessionId);
    }

    if (!session) {
      // Check if a broker was specified for pre-assignment
      let assignedBrokerId = null;
      if (msg.brokerId) {
        const broker = await prisma.broker.findUnique({ where: { id: msg.brokerId } });
        if (broker) assignedBrokerId = broker.id;
      }
      session = await createSession(assignedBrokerId);
    }

    session.chatClients.add(ws);
    ws.role = 'chat';
    ws.sessionId = session.id;
    ws.send(JSON.stringify({
      type: 'session_assigned',
      sessionId: session.id,
      brokerName: session.assignedBrokerName
    }));
    await broadcastSessionList();

  } else if (msg.role === 'broker') {
    const broker = await getBrokerFromToken(msg.token);
    if (!broker) {
      ws.send(JSON.stringify({ type: 'auth_error', error: 'Token invalide.' }));
      ws.close();
      return;
    }

    brokerClients.add(ws);
    ws.role = 'broker';
    ws.brokerId = broker.id;
    ws.brokerName = broker.name;
    ws.brokerRole = broker.role;

    const summaries = await getFilteredSessionList(broker.id, broker.role);
    const enriched = await enrichSessionList(summaries);
    ws.send(JSON.stringify({ type: 'session_list', sessions: enriched }));
  }
}

// ── Abuse protection constants ──────────────────────────────────────────────

const RATE_LIMIT_MESSAGES = 5;   // max user messages per 60s per session
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_MESSAGE_LENGTH = 800;  // chars — truncated silently
const MAX_SESSION_COST = 2.00;   // USD — hard cap per session

// ── Handle User Message ─────────────────────────────────────────────────────

async function handleUserMessage(session, content) {
  // Guard 1: concurrent stream
  if (session.isStreaming) return;

  // Guard 2: per-session rate limit (sliding window)
  const now = Date.now();
  session.rateLimitWindow = session.rateLimitWindow.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (session.rateLimitWindow.length >= RATE_LIMIT_MESSAGES) {
    broadcast(session.chatClients, {
      type: 'message', role: 'ai',
      content: 'Merci de patienter quelques instants avant d\'envoyer un autre message.',
      timestamp: now, sessionId: session.id
    });
    return;
  }
  session.rateLimitWindow.push(now);

  // Guard 3: message length cap
  if (content.length > MAX_MESSAGE_LENGTH) {
    content = content.slice(0, MAX_MESSAGE_LENGTH);
  }

  const userEntry = { role: 'user', content, displayRole: 'user', timestamp: Date.now() };
  await saveMessage(session, userEntry);

  const targets = getBrokerClientsForSession(session);
  broadcast(targets, {
    type: 'message', role: 'user', content, timestamp: userEntry.timestamp, sessionId: session.id
  });

  await broadcastSessionList();

  // If broker has taken control, skip Claude response
  if (session.controlledByBrokerId) return;

  // Guard 4: per-session cost cap
  if (session.stats.totalCost >= MAX_SESSION_COST) {
    const brokerName = session.assignedBrokerName || DEFAULT_BROKER_NAME;
    broadcast(session.chatClients, {
      type: 'message', role: 'ai',
      content: `Je vais laisser ${brokerName} prendre le relai directement avec vous. Merci pour votre patience!`,
      timestamp: Date.now(), sessionId: session.id
    });
    return;
  }

  const brokerName = session.assignedBrokerName || DEFAULT_BROKER_NAME;

  session.isStreaming = true;
  try {
    const startTime = Date.now();
    const stream = streamChatResponse(session, brokerName);

    let fullResponse = '';

    stream.on('text', (text) => {
      fullResponse += text;
      broadcast(session.chatClients, { type: 'stream_token', content: text, sessionId: session.id });
      broadcast(targets, { type: 'stream_token', content: text, sessionId: session.id });
    });

    const finalMsg = await stream.finalMessage();
    const responseTime = Date.now() - startTime;

    const inputTokens = finalMsg.usage.input_tokens;
    const outputTokens = finalMsg.usage.output_tokens;
    const cost = calculateCost(inputTokens, outputTokens, CHAT_MODEL);

    await updateStats(session, inputTokens, outputTokens, cost, responseTime);

    const aiEntry = { role: 'assistant', content: fullResponse, timestamp: Date.now() };
    await saveMessage(session, aiEntry);

    broadcast(session.chatClients, { type: 'stream_done', sessionId: session.id });
    broadcast(targets, { type: 'stream_done', sessionId: session.id });

    broadcast(targets, {
      type: 'stream_stats',
      inputTokens, outputTokens, cost, responseTime,
      sessionStats: { ...session.stats },
      sessionId: session.id
    });

    await broadcastSessionList();

    // Extract lead profile async
    extractLeadProfileAsync(session, brokerName).catch(() => {});

  } catch (err) {
    console.error('Claude API error:', err.message);
    const fallback = `Désolée, je rencontre une difficulté technique. ${brokerName} vous contactera sous peu.`;
    broadcast(session.chatClients, { type: 'stream_done', sessionId: session.id });
    broadcast(targets, { type: 'stream_done', sessionId: session.id });
    broadcast(session.chatClients, {
      type: 'message', role: 'ai', content: fallback, timestamp: Date.now(), sessionId: session.id
    });
    broadcast(targets, {
      type: 'message', role: 'ai', content: fallback, timestamp: Date.now(), sessionId: session.id
    });
  } finally {
    session.isStreaming = false;
  }
}

// ── Handle Broker Message ───────────────────────────────────────────────────

async function handleBrokerMessage(session, content, brokerId, brokerName) {
  const brokerEntry = {
    role: 'broker',
    content,
    brokerName,
    brokerId,
    displayRole: 'broker',
    timestamp: Date.now()
  };
  await saveMessage(session, brokerEntry);

  const msgPayload = {
    type: 'message',
    role: 'broker',
    content,
    brokerName,
    timestamp: brokerEntry.timestamp,
    sessionId: session.id
  };

  const targets = getBrokerClientsForSession(session);
  broadcast(session.chatClients, msgPayload);
  broadcast(targets, msgPayload);
  await broadcastSessionList();
}

// ── Async Lead Extraction ───────────────────────────────────────────────────

async function extractLeadProfileAsync(session, brokerName) {
  const { profile, inputTokens, outputTokens, cost, responseTime } = await extractLeadProfile(session.conversation, brokerName);

  await updateLeadProfile(session, profile);
  await updateStats(session, inputTokens, outputTokens, cost, responseTime);

  const targets = getBrokerClientsForSession(session);
  broadcast(targets, { type: 'lead_update', profile, sessionId: session.id });
  broadcast(targets, {
    type: 'lead_extraction_stats',
    inputTokens, outputTokens, cost, responseTime,
    sessionStats: { ...session.stats },
    sessionId: session.id
  });

  await broadcastSessionList();
}

module.exports = { setupWebSocket };
