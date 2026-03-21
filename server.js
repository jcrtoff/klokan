const dotenv = require('dotenv');
dotenv.config();

const crypto = require('crypto');
const http = require('http');
const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const AGENT_NAME = process.env.AGENT_NAME || 'Rod';

// ── Models & Pricing ────────────────────────────────────────────────────────
const CHAT_MODEL = 'claude-sonnet-4-6';
const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';

const PRICING = {
  [CHAT_MODEL]:       { inputPerMillion: 3, outputPerMillion: 15 },
  [EXTRACTION_MODEL]: { inputPerMillion: 1, outputPerMillion: 5 },
};

function calculateCost(inputTokens, outputTokens, model) {
  const p = PRICING[model] || PRICING[CHAT_MODEL];
  return (inputTokens * p.inputPerMillion / 1_000_000)
       + (outputTokens * p.outputPerMillion / 1_000_000);
}

// ── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/chat', (_req, res) => res.sendFile(path.join(__dirname, 'public/chat.html')));
app.get('/agent', (_req, res) => res.sendFile(path.join(__dirname, 'public/agent.html')));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/version', (_req, res) => res.json({ sha: process.env.COMMIT_SHA || 'dev' }));

// ── Anthropic client ────────────────────────────────────────────────────────
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `Tu es Roxanne, l'assistante virtuelle de Rod, courtier immobilier agréé à Montréal (OACIQ). Tu fais partie de RodCast, la plateforme intelligente de Rod.

Ton rôle est d'accueillir les acheteurs et vendeurs potentiels, de comprendre leurs besoins et de qualifier leur projet immobilier.

LANGUE: Réponds toujours dans la même langue que le client. Si le client écrit en français, réponds en français québécois naturel et chaleureux. Si le client écrit en English, switch to English seamlessly.

TON: Chaleureux, professionnel, jamais agressif. Tu poses une question à la fois. Tu ne fais jamais de pression.

CE QUE TU FAIS:
- Accueillir le client et comprendre son projet (achat, vente, investissement)
- Qualifier son budget, son secteur préféré, son délai, son type de propriété
- Vérifier s'il a une pré-approbation hypothécaire (pour les acheteurs)
- Proposer de planifier une rencontre ou une visite avec Rod
- Répondre aux questions générales sur le marché immobilier montréalais

CE QUE TU NE FAIS PAS:
- Tu ne donnes jamais de conseils hypothécaires ou juridiques précis — tu réfères toujours à un expert
- Tu ne mentionnes jamais de prix spécifiques de propriétés (tu n'as pas accès au MLS en direct)
- Tu ne prends pas de décisions à la place du courtier

QUALIFICATION: Au fil de la conversation, essaie naturellement d'extraire:
- Type de projet: achat / vente / investissement / location
- Budget approximatif
- Secteur(s) préféré(s) à Montréal
- Type de propriété: condo, plex, maison, etc.
- Délai: dans combien de temps?
- Pré-approbation: oui / non / en cours

COORDONNÉES — C'EST UNE PRIORITÉ:
1. Prénom: demande-le dès que le client mentionne son projet ("Au fait, c'est quoi ton prénom?")
2. Courriel ou téléphone: dès que tu as le prénom ET le type de projet, ta prochaine réponse DOIT inclure une demande de courriel ou numéro ("Pour que Rod puisse te revenir rapidement, est-ce que tu voudrais me laisser ton courriel ou ton numéro?")
- Une seule coordonnée à la fois — ne fais jamais sentir que c'est un formulaire
- Si le client décline, n'insiste pas et continue normalement
- Ne passe PAS à la qualification détaillée (budget, secteur, etc.) avant d'avoir demandé une coordonnée

Garde tes réponses courtes — 2-3 phrases max. Tu es dans un chat mobile.`;

// ── Per-session state ───────────────────────────────────────────────────────
const sessions = new Map();
const sessionTimeouts = new Map();

function createSession(id) {
  const session = {
    id,
    conversation: [],
    leadProfile: {},
    agentControlled: false,
    stats: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      responseCount: 0,
      totalResponseTime: 0
    },
    chatClients: new Set(),
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
  sessions.set(id, session);
  return session;
}

function getSessionSummary(session) {
  return {
    id: session.id,
    leadName: (session.leadProfile.name && session.leadProfile.name !== 'null')
      ? session.leadProfile.name : null,
    leadScore: (session.leadProfile.leadScore && session.leadProfile.leadScore !== 'null')
      ? session.leadProfile.leadScore : null,
    messageCount: session.conversation.length,
    lastActivity: session.lastActivity,
    agentControlled: session.agentControlled
  };
}

function getSessionList() {
  return Array.from(sessions.values())
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .map(getSessionSummary);
}

// ── WebSocket server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });
const agentClients = new Set();

function broadcast(clients, data) {
  const json = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) client.send(json);
  }
}

function broadcastSessionList() {
  broadcast(agentClients, { type: 'session_list', sessions: getSessionList() });
}

function sendSessionState(ws, session) {
  // Send full state for a session to an agent
  ws.send(JSON.stringify({ type: 'lead_update', profile: session.leadProfile, sessionId: session.id }));
  ws.send(JSON.stringify({ type: 'agent_control', active: session.agentControlled, sessionId: session.id }));
  ws.send(JSON.stringify({ type: 'session_stats', stats: session.stats, sessionId: session.id }));

  // Send conversation history
  for (const entry of session.conversation) {
    ws.send(JSON.stringify({
      type: 'message',
      role: entry.role === 'assistant' ? 'ai' : entry.displayRole || entry.role,
      content: entry.content,
      agentName: entry.agentName,
      timestamp: entry.timestamp,
      sessionId: session.id
    }));
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'identify':
        if (msg.role === 'chat') {
          let session;
          if (msg.sessionId && sessions.has(msg.sessionId)) {
            // Resume existing session
            session = sessions.get(msg.sessionId);
            // Cancel cleanup timeout if any
            if (sessionTimeouts.has(session.id)) {
              clearTimeout(sessionTimeouts.get(session.id));
              sessionTimeouts.delete(session.id);
            }
          } else {
            // Create new session
            session = createSession(crypto.randomUUID());
          }
          session.chatClients.add(ws);
          ws.role = 'chat';
          ws.sessionId = session.id;
          ws.send(JSON.stringify({ type: 'session_assigned', sessionId: session.id }));
          broadcastSessionList();
        } else if (msg.role === 'agent') {
          agentClients.add(ws);
          ws.role = 'agent';
          // Send current session list
          ws.send(JSON.stringify({ type: 'session_list', sessions: getSessionList() }));
        }
        break;

      case 'user_message': {
        const session = sessions.get(ws.sessionId);
        if (session) handleUserMessage(session, msg.content);
        break;
      }

      case 'agent_message': {
        const session = sessions.get(msg.sessionId);
        if (session) handleAgentMessage(session, msg.content);
        break;
      }

      case 'agent_control': {
        const session = sessions.get(msg.sessionId);
        if (session) {
          session.agentControlled = !!msg.active;
          broadcast(session.chatClients, { type: 'agent_control', active: session.agentControlled });
          broadcastSessionList();
        }
        break;
      }

      case 'agent_typing': {
        const session = sessions.get(msg.sessionId);
        if (session) {
          broadcast(session.chatClients, { type: 'agent_typing', isTyping: msg.isTyping });
        }
        break;
      }

      case 'select_session': {
        const session = sessions.get(msg.sessionId);
        if (session) {
          sendSessionState(ws, session);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws.role === 'chat' && ws.sessionId) {
      const session = sessions.get(ws.sessionId);
      if (session) {
        session.chatClients.delete(ws);
        // If no chat clients left, start 30-minute cleanup timeout
        if (session.chatClients.size === 0) {
          const timeout = setTimeout(() => {
            sessions.delete(session.id);
            sessionTimeouts.delete(session.id);
            broadcast(agentClients, { type: 'session_closed', sessionId: session.id });
            broadcastSessionList();
          }, 30 * 60 * 1000);
          sessionTimeouts.set(session.id, timeout);
        }
        broadcastSessionList();
      }
    }
    if (ws.role === 'agent') {
      agentClients.delete(ws);
    }
  });
});

// ── Handle user message ─────────────────────────────────────────────────────
async function handleUserMessage(session, content) {
  session.lastActivity = Date.now();
  const userEntry = { role: 'user', content, displayRole: 'user', timestamp: Date.now() };
  session.conversation.push(userEntry);

  // Broadcast user message to agent clients
  broadcast(agentClients, {
    type: 'message', role: 'user', content, timestamp: userEntry.timestamp, sessionId: session.id
  });

  broadcastSessionList();

  // If agent has taken control, skip Claude response
  if (session.agentControlled) return;

  // Build messages for Claude API
  const apiMessages = session.conversation.map(entry => ({
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content: entry.role === 'agent'
      ? `[${entry.agentName || AGENT_NAME}]: ${entry.content}`
      : entry.content
  }));

  try {
    const startTime = Date.now();

    const stream = anthropic.messages.stream({
      model: CHAT_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: apiMessages
    });

    let fullResponse = '';

    stream.on('text', (text) => {
      fullResponse += text;
      broadcast(session.chatClients, { type: 'stream_token', content: text, sessionId: session.id });
      broadcast(agentClients, { type: 'stream_token', content: text, sessionId: session.id });
    });

    const finalMsg = await stream.finalMessage();
    const responseTime = Date.now() - startTime;

    // Capture token usage
    const inputTokens = finalMsg.usage.input_tokens;
    const outputTokens = finalMsg.usage.output_tokens;
    const cost = calculateCost(inputTokens, outputTokens, CHAT_MODEL);

    session.stats.totalInputTokens += inputTokens;
    session.stats.totalOutputTokens += outputTokens;
    session.stats.totalCost += cost;
    session.stats.responseCount += 1;
    session.stats.totalResponseTime += responseTime;

    // Save assistant response
    const aiEntry = { role: 'assistant', content: fullResponse, timestamp: Date.now() };
    session.conversation.push(aiEntry);

    broadcast(session.chatClients, { type: 'stream_done', sessionId: session.id });
    broadcast(agentClients, { type: 'stream_done', sessionId: session.id });

    // Send stream stats to agent only
    broadcast(agentClients, {
      type: 'stream_stats',
      inputTokens,
      outputTokens,
      cost,
      responseTime,
      sessionStats: { ...session.stats },
      sessionId: session.id
    });

    broadcastSessionList();

    // Extract lead profile async — don't block
    extractLeadProfile(session).catch(() => {});

  } catch (err) {
    console.error('Claude API error:', err.message);
    const fallback = `Désolée, je rencontre une difficulté technique. ${AGENT_NAME} vous contactera sous peu.`;
    broadcast(session.chatClients, { type: 'stream_done', sessionId: session.id });
    broadcast(agentClients, { type: 'stream_done', sessionId: session.id });
    broadcast(session.chatClients, {
      type: 'message', role: 'ai', content: fallback, timestamp: Date.now(), sessionId: session.id
    });
    broadcast(agentClients, {
      type: 'message', role: 'ai', content: fallback, timestamp: Date.now(), sessionId: session.id
    });
  }
}

// ── Handle agent message ────────────────────────────────────────────────────
function handleAgentMessage(session, content) {
  session.lastActivity = Date.now();
  const agentEntry = {
    role: 'agent',
    content,
    agentName: AGENT_NAME,
    displayRole: 'agent',
    timestamp: Date.now()
  };
  session.conversation.push(agentEntry);

  const msgPayload = {
    type: 'message',
    role: 'agent',
    content,
    agentName: AGENT_NAME,
    timestamp: agentEntry.timestamp,
    sessionId: session.id
  };

  broadcast(session.chatClients, msgPayload);
  broadcast(agentClients, msgPayload);
  broadcastSessionList();
  // Agent messages do NOT trigger Claude response
}

// ── Lead profile extraction ─────────────────────────────────────────────────
async function extractLeadProfile(session) {
  const conversationText = session.conversation
    .map(e => {
      if (e.role === 'user') return `Client: ${e.content}`;
      if (e.role === 'assistant') return `Roxanne: ${e.content}`;
      if (e.role === 'agent') return `${e.agentName || AGENT_NAME}: ${e.content}`;
      return '';
    })
    .join('\n');

  const extractionPrompt = `Based on the conversation below, extract any real estate lead qualification data that has been mentioned or can be inferred. Return ONLY a JSON object with these exact keys (use null for unknown values):

{
  "name": "client's first name or full name, or null",
  "email": "client's email address, or null",
  "phone": "client's phone number, or null",
  "projectType": "achat|vente|investissement|location|null",
  "budget": "string or null",
  "neighbourhood": "string or null",
  "propertyType": "string or null",
  "timeline": "string or null",
  "preApproval": "oui|non|en cours|null",
  "leadScore": "froid|tiède|chaud|null",
  "notes": "one short sentence summary or null"
}

Conversation:
${conversationText}

Return only the JSON, no explanation, no markdown fences.`;

  const extractionStart = Date.now();

  const response = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: extractionPrompt }]
  });

  const extractionTime = Date.now() - extractionStart;

  // Capture extraction token usage
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = calculateCost(inputTokens, outputTokens, EXTRACTION_MODEL);

  session.stats.totalInputTokens += inputTokens;
  session.stats.totalOutputTokens += outputTokens;
  session.stats.totalCost += cost;
  session.stats.responseCount += 1;
  session.stats.totalResponseTime += extractionTime;

  let text = response.content[0].text.trim();
  // Strip markdown fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  const profile = JSON.parse(text);
  session.leadProfile = profile;
  broadcast(agentClients, { type: 'lead_update', profile, sessionId: session.id });

  // Send extraction stats to agent only
  broadcast(agentClients, {
    type: 'lead_extraction_stats',
    inputTokens,
    outputTokens,
    cost,
    responseTime: extractionTime,
    sessionStats: { ...session.stats },
    sessionId: session.id
  });

  broadcastSessionList();
}

// ── Start server ────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`RodCast server running on http://localhost:${PORT}`);
  console.log(`  Chat: http://localhost:${PORT}/chat`);
  console.log(`  Agent: http://localhost:${PORT}/agent`);
  console.log(`  SHA: ${process.env.COMMIT_SHA || 'dev'}`);
});
