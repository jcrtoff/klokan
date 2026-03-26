const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

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

// ── System Prompt ───────────────────────────────────────────────────────────

const DEFAULT_BROKER_NAME = process.env.DEFAULT_BROKER_NAME || 'Rod';

function getSystemPrompt(brokerName) {
  const name = brokerName || DEFAULT_BROKER_NAME;
  return `Tu es Roxanne, l'assistante virtuelle de ${name}, courtier immobilier agréé à Montréal (OACIQ). Tu fais partie de Klokan, la plateforme intelligente de ${name}.

Ton rôle est d'accueillir les acheteurs et vendeurs potentiels, de comprendre leurs besoins et de qualifier leur projet immobilier.

LANGUE: Réponds toujours dans la même langue que le client. Si le client écrit en français, réponds en français québécois naturel et chaleureux. Si le client écrit en English, switch to English seamlessly.

TON: Chaleureux, professionnel, jamais agressif. Tu poses une question à la fois. Tu ne fais jamais de pression.

CE QUE TU FAIS:
- Accueillir le client et comprendre son projet (achat, vente, investissement)
- Qualifier son budget, son secteur préféré, son délai, son type de propriété
- Vérifier s'il a une pré-approbation hypothécaire (pour les acheteurs)
- Proposer de planifier une rencontre ou une visite avec ${name}
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
2. Courriel ou téléphone: dès que tu as le prénom ET le type de projet, ta prochaine réponse DOIT inclure une demande de courriel ou numéro ("Pour que ${name} puisse te revenir rapidement, est-ce que tu voudrais me laisser ton courriel ou ton numéro?")
- Une seule coordonnée à la fois — ne fais jamais sentir que c'est un formulaire
- Si le client décline, n'insiste pas et continue normalement
- Ne passe PAS à la qualification détaillée (budget, secteur, etc.) avant d'avoir demandé une coordonnée

Garde tes réponses courtes — 2-3 phrases max. Tu es dans un chat mobile.`;
}

// ── Streaming Chat ──────────────────────────────────────────────────────────

function streamChatResponse(session, brokerName) {
  const apiMessages = session.conversation.map(entry => ({
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content: entry.role === 'broker'
      ? `[${entry.brokerName || brokerName || DEFAULT_BROKER_NAME}]: ${entry.content}`
      : entry.content
  }));

  return anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 512,
    system: getSystemPrompt(brokerName),
    messages: apiMessages
  });
}

// ── Lead Profile Extraction ─────────────────────────────────────────────────

async function extractLeadProfile(conversation, brokerName) {
  const conversationText = conversation
    .map(e => {
      if (e.role === 'user') return `Client: ${e.content}`;
      if (e.role === 'assistant') return `Roxanne: ${e.content}`;
      if (e.role === 'broker') return `${e.brokerName || brokerName || DEFAULT_BROKER_NAME}: ${e.content}`;
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

  const startTime = Date.now();

  const response = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: extractionPrompt }]
  });

  const responseTime = Date.now() - startTime;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = calculateCost(inputTokens, outputTokens, EXTRACTION_MODEL);

  let text = response.content[0].text.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const profile = JSON.parse(text);

  return { profile, inputTokens, outputTokens, cost, responseTime };
}

module.exports = {
  CHAT_MODEL,
  EXTRACTION_MODEL,
  DEFAULT_BROKER_NAME,
  calculateCost,
  getSystemPrompt,
  streamChatResponse,
  extractLeadProfile
};
