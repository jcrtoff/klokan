const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const AGENT_NAME = process.env.AGENT_NAME || 'Rod';

// ── Pricing ─────────────────────────────────────────────────────────────────
const PRICING = { inputPerMillion: 3, outputPerMillion: 15 };
function calculateCost(inputTokens, outputTokens) {
  return (inputTokens * PRICING.inputPerMillion / 1_000_000)
       + (outputTokens * PRICING.outputPerMillion / 1_000_000);
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

COORDONNÉES: Recueille les coordonnées naturellement au fil de la conversation:
- Prénom: demande-le tôt, dès que le client a décrit son projet — c'est naturel de se présenter ("Au fait, c'est quoi ton prénom?")
- Courriel ou téléphone: demande-le tôt, dès que tu as le prénom et le type de projet — propose que Rod puisse le contacter ("Pour que Rod puisse te revenir rapidement, est-ce que tu voudrais me laisser ton courriel ou ton numéro?")
- Une seule coordonnée à la fois — ne fais jamais sentir que c'est un formulaire
- Si le client décline, n'insiste pas et continue normalement

Garde tes réponses courtes — 2-3 phrases max. Tu es dans un chat mobile.`;

// ── In-memory state ─────────────────────────────────────────────────────────
const state = {
  conversation: [],
  leadProfile: {},
  agentControlled: false,
  stats: {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    responseCount: 0,
    totalResponseTime: 0
  }
};

// ── WebSocket server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });
const chatClients = new Set();
const agentClients = new Set();

function broadcast(clients, data) {
  const json = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) client.send(json);
  }
}

function broadcastClientCount() {
  broadcast(agentClients, { type: 'client_count', count: chatClients.size });
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'identify':
        if (msg.role === 'chat') {
          chatClients.add(ws);
          broadcastClientCount();
        } else if (msg.role === 'agent') {
          agentClients.add(ws);
          broadcastClientCount();
          // Send current lead profile if exists
          if (Object.keys(state.leadProfile).length > 0) {
            ws.send(JSON.stringify({ type: 'lead_update', profile: state.leadProfile }));
          }
          // Send current agent control state
          ws.send(JSON.stringify({ type: 'agent_control', active: state.agentControlled }));
          // Send current session stats
          ws.send(JSON.stringify({ type: 'session_stats', stats: state.stats }));
          // Send conversation history
          for (const entry of state.conversation) {
            ws.send(JSON.stringify({
              type: 'message',
              role: entry.role === 'assistant' ? 'ai' : entry.displayRole || entry.role,
              content: entry.content,
              agentName: entry.agentName,
              timestamp: entry.timestamp
            }));
          }
        }
        break;

      case 'user_message':
        handleUserMessage(msg.content);
        break;

      case 'agent_message':
        handleAgentMessage(msg.content);
        break;

      case 'agent_control':
        state.agentControlled = !!msg.active;
        broadcast(chatClients, { type: 'agent_control', active: state.agentControlled });
        break;

      case 'agent_typing':
        broadcast(chatClients, { type: 'agent_typing', isTyping: msg.isTyping });
        break;
    }
  });

  ws.on('close', () => {
    chatClients.delete(ws);
    agentClients.delete(ws);
    broadcastClientCount();
  });
});

// ── Handle user message ─────────────────────────────────────────────────────
async function handleUserMessage(content) {
  const userEntry = { role: 'user', content, displayRole: 'user', timestamp: Date.now() };
  state.conversation.push(userEntry);

  // Broadcast user message to agent clients
  broadcast(agentClients, {
    type: 'message', role: 'user', content, timestamp: userEntry.timestamp
  });

  // If agent has taken control, skip Claude response
  if (state.agentControlled) return;

  // Build messages for Claude API
  const apiMessages = state.conversation.map(entry => ({
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content: entry.role === 'agent'
      ? `[${entry.agentName || AGENT_NAME}]: ${entry.content}`
      : entry.content
  }));

  try {
    const startTime = Date.now();

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: apiMessages
    });

    let fullResponse = '';

    stream.on('text', (text) => {
      fullResponse += text;
      broadcast(chatClients, { type: 'stream_token', content: text });
      broadcast(agentClients, { type: 'stream_token', content: text });
    });

    const finalMsg = await stream.finalMessage();
    const responseTime = Date.now() - startTime;

    // Capture token usage
    const inputTokens = finalMsg.usage.input_tokens;
    const outputTokens = finalMsg.usage.output_tokens;
    const cost = calculateCost(inputTokens, outputTokens);

    state.stats.totalInputTokens += inputTokens;
    state.stats.totalOutputTokens += outputTokens;
    state.stats.totalCost += cost;
    state.stats.responseCount += 1;
    state.stats.totalResponseTime += responseTime;

    // Save assistant response
    const aiEntry = { role: 'assistant', content: fullResponse, timestamp: Date.now() };
    state.conversation.push(aiEntry);

    broadcast(chatClients, { type: 'stream_done' });
    broadcast(agentClients, { type: 'stream_done' });

    // Send stream stats to agent only
    broadcast(agentClients, {
      type: 'stream_stats',
      inputTokens,
      outputTokens,
      cost,
      responseTime,
      sessionStats: { ...state.stats }
    });

    // Extract lead profile async — don't block
    extractLeadProfile().catch(() => {});

  } catch (err) {
    console.error('Claude API error:', err.message);
    const fallback = `Désolée, je rencontre une difficulté technique. ${AGENT_NAME} vous contactera sous peu.`;
    broadcast(chatClients, { type: 'stream_done' });
    broadcast(agentClients, { type: 'stream_done' });
    broadcast(chatClients, {
      type: 'message', role: 'ai', content: fallback, timestamp: Date.now()
    });
    broadcast(agentClients, {
      type: 'message', role: 'ai', content: fallback, timestamp: Date.now()
    });
  }
}

// ── Handle agent message ────────────────────────────────────────────────────
function handleAgentMessage(content) {
  const agentEntry = {
    role: 'agent',
    content,
    agentName: AGENT_NAME,
    displayRole: 'agent',
    timestamp: Date.now()
  };
  state.conversation.push(agentEntry);

  const msgPayload = {
    type: 'message',
    role: 'agent',
    content,
    agentName: AGENT_NAME,
    timestamp: agentEntry.timestamp
  };

  broadcast(chatClients, msgPayload);
  broadcast(agentClients, msgPayload);
  // Agent messages do NOT trigger Claude response
}

// ── Lead profile extraction ─────────────────────────────────────────────────
async function extractLeadProfile() {
  const conversationText = state.conversation
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
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content: extractionPrompt }]
  });

  const extractionTime = Date.now() - extractionStart;

  // Capture extraction token usage
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = calculateCost(inputTokens, outputTokens);

  state.stats.totalInputTokens += inputTokens;
  state.stats.totalOutputTokens += outputTokens;
  state.stats.totalCost += cost;
  state.stats.responseCount += 1;
  state.stats.totalResponseTime += extractionTime;

  let text = response.content[0].text.trim();
  // Strip markdown fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  const profile = JSON.parse(text);
  state.leadProfile = profile;
  broadcast(agentClients, { type: 'lead_update', profile });

  // Send extraction stats to agent only
  broadcast(agentClients, {
    type: 'lead_extraction_stats',
    inputTokens,
    outputTokens,
    cost,
    responseTime: extractionTime,
    sessionStats: { ...state.stats }
  });
}

// ── Start server ────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`RodCast server running on http://localhost:${PORT}`);
  console.log(`  Chat: http://localhost:${PORT}/chat`);
  console.log(`  Agent: http://localhost:${PORT}/agent`);
  console.log(`  SHA: ${process.env.COMMIT_SHA || 'dev'}`);
});
