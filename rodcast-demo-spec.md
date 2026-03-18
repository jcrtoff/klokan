	# RodCast — Build spec

## Context

This is a proof-of-concept demo for **RodCast**, a Quebec real estate AI platform — think competitor to ImmoContact.ca, inspired by evaia.ca. The goal is to demonstrate live, in a room with brokerage executives and potential co-founders, that:

1. An AI assistant can hold a natural qualifying conversation in Quebec French (and English) with a prospective buyer or seller
2. An agent can watch that conversation happen in real time
3. The agent can jump into the conversation at any moment with a single click

No database. No auth. No persistence between server restarts. Everything in memory. This is a demo, not a product.

---

## What to build

A single Node.js server with two frontend views:

### `/chat` — the client-facing widget
Simulates the chat bubble a buyer would see on a real estate agent's website. Clean, mobile-first. The user types messages and the AI (Claude API) responds in real time via streaming. Looks polished enough to be believable as a real product.

### `/agent` — the agent inbox
Simulates the agent dashboard. Shows:
- The live conversation as it happens (streamed in real time via WebSocket)
- A **lead profile panel** on the right that auto-populates as the AI extracts qualifying signals from the conversation (budget, neighbourhood, timeline, property type, pre-approval status)
- An **"Intervenir"** button that opens a compose bar — the agent can type a message that is injected directly into the conversation
- When the agent sends a message, it appears on `/chat` instantly, visually distinct from AI messages (different colour, labelled with agent name)
- A status indicator: "IA en conversation" / "Vous avez pris le relais"

---

## Tech stack

- **Runtime**: Node.js (v18+)
- **Server framework**: Express
- **Realtime**: WebSockets via the `ws` package — no socket.io, keep it simple
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`) with streaming responses
- **Frontend**: Vanilla HTML/CSS/JS — no React, no build step, no bundler. Just static files served by Express. This keeps Claude Code iteration fast.
- **State**: In-memory only. One global object holds the conversation thread and extracted lead profile. Resets on server restart. No Redis, no database, no file system writes.
- **Deployment target**: Docker container on a production Kubernetes/container cluster. Secrets injected at runtime via Doppler — never baked into the image.

---

## File structure

```
/
├── server.js              # Express + WebSocket server, Claude API calls
├── package.json
├── .env.example           # Local dev only — never committed with real values
├── Dockerfile             # Production image
├── .dockerignore
├── scripts/
│   └── deploy-production.sh   # Build, tag, push, deploy
└── public/
    ├── chat.html          # Client chat widget
    ├── agent.html         # Agent inbox dashboard
    └── style.css          # Shared styles (minimal, CSS variables for theming)
```

No subfolders beyond `public/` and `scripts/`. Keep everything flat and readable.

---

## AI system prompt

The AI persona is **"Roxanne"**, the virtual assistante of **Rod**, fictitious courtier immobilier in Montreal. The product is called **RodCast**.

Use this system prompt verbatim (the builder should not rewrite this — it is the core product logic):

```
Tu es Roxanne, l'assistante virtuelle de Rod, courtier immobilier agréé à Montréal (OACIQ). Tu fais partie de RodCast, la plateforme intelligente de Rod.

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

Garde tes réponses courtes — 2-3 phrases max. Tu es dans un chat mobile.
```

---

## Lead profile extraction

After each AI response, make a **second Claude API call** (non-streaming, fast) to extract structured lead data from the full conversation so far. Use this extraction prompt:

```
Based on the conversation below, extract any real estate lead qualification data that has been mentioned or can be inferred. Return ONLY a JSON object with these exact keys (use null for unknown values):

{
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
[INSERT FULL CONVERSATION]

Return only the JSON, no explanation, no markdown fences.
```

Send this extracted JSON to the agent dashboard via WebSocket whenever it updates. The agent panel renders it live.

---

## WebSocket message protocol

Keep it simple — all messages are JSON with a `type` field:

```js
// New message in conversation (sent to all connected clients)
{ type: "message", role: "user"|"ai"|"agent", content: "...", timestamp: Date.now() }

// AI is streaming (sent token by token to /chat)
{ type: "stream_token", content: "..." }

// AI stream complete
{ type: "stream_done" }

// Lead profile updated
{ type: "lead_update", profile: { ...extracted fields } }

// Agent is typing (sent to /chat so it can show indicator)
{ type: "agent_typing", isTyping: true|false }

// Agent jumps in (sent from /agent to server, server broadcasts to /chat)
{ type: "agent_message", content: "...", agentName: "Jean-Thomas" }
```

The server holds two WebSocket client sets: `chatClients` and `agentClients`. Messages route appropriately — don't broadcast everything to everyone.

---

## UI behaviour

### `/chat` (mobile-first)

- Fake header: "Roxanne — Assistante de Rod · RodCast" with a small green "en ligne" dot
- Messages appear in chat bubbles: user messages right-aligned (blue), AI messages left-aligned (white/gray), agent messages left-aligned but with a distinct warm colour (amber) and label "Rod"
- Streaming: AI response streams in token by token — show a typing indicator first, then replace with streaming text
- When agent is typing: show "Rod est en train d'écrire…" indicator
- Input: text field + send button, fixed at bottom, mobile keyboard-aware

### `/agent` (desktop two-pane layout)

**Left pane (60%) — conversation feed**
- Same message bubbles as `/chat` so it looks identical to what the client sees
- Header shows connection status: "1 client connecté" or "En attente d'un client"
- "Intervenir" button fixed at bottom right — opens compose bar
- When agent has taken over: button changes to "Rendre le contrôle à l'IA" 

**Right pane (40%) — lead profile**
- Card at top: empty avatar circle with initials once name is known, name, phone placeholder
- Qualification grid: 6 fields (project type, budget, neighbourhood, property type, timeline, pre-approval) — each shows a muted dash until populated, then animates in
- Lead score badge: FROID (gray) / TIÈDE (amber) / CHAUD (red) — updates automatically
- "Notes IA" section: one-line summary from the extraction
- All fields update live via WebSocket without page refresh

---

## Visual design

Use CSS variables for all colours. The palette should feel like a real PropTech product — not a prototype:

```css
:root {
  --bg: #f8f7f4;
  --surface: #ffffff;
  --border: rgba(0,0,0,0.08);
  --text-primary: #1a1a18;
  --text-secondary: #6b6a65;
  --teal-50: #E1F5EE;
  --teal-600: #0F6E56;
  --teal-800: #085041;
  --amber-50: #FAEEDA;
  --amber-600: #854F0B;
  --blue-50: #E6F1FB;
  --blue-600: #185FA5;
  --red-bg: #FCEBEB;
  --red-text: #A32D2D;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

No external CSS frameworks. No Tailwind. Just these variables and clean utility CSS.

---

## Demo script (for the builder's reference)

This is how the demo gets run in the room so the UI should support this flow cleanly:

1. Presenter opens `/agent` on laptop — projector shows it, RodCast branding visible
2. QR code displayed (or URL shared) — someone in room opens `/chat` on their phone
3. That person types: *"Bonjour, je cherche un condo à Rosemont, budget environ 500 000 $"*
4. Room watches Roxanne respond in ~2 seconds in Quebec French
5. Lead profile panel starts populating live on the agent screen — neighbourhood, budget appear
6. Conversation continues 2–3 more turns, more fields populate
7. Presenter clicks **Intervenir**, types: *"Bonjour! Je suis Rod, je serais ravi de vous aider personnellement. Êtes-vous disponible cette semaine?"*
8. Message appears instantly on the phone — amber coloured, labelled "Rod"
9. Demo ends. The room has seen the full concept in under 4 minutes.

---

## Environment variables

All secrets are managed via **Doppler**. The app reads from `process.env` — it does not care whether the values came from Doppler, a local `.env`, or the container runtime. Never hardcode secrets anywhere.

```
ANTHROPIC_API_KEY=        # Required — Claude API key (injected by Doppler)
PORT=3000                 # Optional, defaults to 3000
AGENT_NAME=Rod            # Optional, defaults to "Rod"
```

### Local development

For local dev, install the Doppler CLI and run:

```bash
doppler run -- npm run dev
```

This injects secrets directly into the process — no `.env` file needed. The `.env.example` file documents the variable names only, with no values, and is the only env-related file ever committed to git.

```
# .env.example — variable names only, no values
ANTHROPIC_API_KEY=
PORT=3000
AGENT_NAME=Rod
```

Add `.env` to `.gitignore` unconditionally.

---

## Docker

### Dockerfile

The image is lean, non-root, and contains zero secrets. Secrets are injected at runtime by the Doppler sidecar or via the cluster's secret injection mechanism.

```dockerfile
FROM node:20-alpine

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# App source
COPY server.js ./
COPY public/ ./public/

# Ownership
RUN chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
```

### Health endpoint

Add a `GET /health` route to `server.js` that returns `200 OK` with `{ status: "ok" }`. Required for the Docker healthcheck and for load balancer probes in the cluster.

```js
app.get('/health', (req, res) => res.json({ status: 'ok' }));
```

### .dockerignore

```
node_modules
.env
.env.*
!.env.example
*.md
.git
.gitignore
scripts/
```

---

## Deployment — `./scripts/deploy-production.sh`

This script does four things in sequence:
1. Injects production secrets from Doppler into the build environment
2. Builds and tags the Docker image
3. Pushes to the container registry
4. Triggers the deployment on the cluster (kubectl rollout or equivalent)

Claude Code should create this script at `scripts/deploy-production.sh` with the following content:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
IMAGE_NAME="${IMAGE_NAME:-rodcast}"
REGISTRY="${REGISTRY:-registry.your-cluster.com}"   # override via env
TAG="${TAG:-$(git rev-parse --short HEAD)}"
DOPPLER_PROJECT="${DOPPLER_PROJECT:-rodcast}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-production}"
NAMESPACE="${NAMESPACE:-default}"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-rodcast}"

FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
LATEST_IMAGE="${REGISTRY}/${IMAGE_NAME}:latest"

echo "▶ Building ${FULL_IMAGE}"

# ── 1. Verify Doppler is authenticated ────────────────────────────────────────
if ! doppler me --silent 2>/dev/null; then
  echo "✗ Not authenticated with Doppler. Run: doppler login"
  exit 1
fi

echo "✓ Doppler authenticated (project: ${DOPPLER_PROJECT}, config: ${DOPPLER_CONFIG})"

# ── 2. Build Docker image ─────────────────────────────────────────────────────
# Secrets are NOT passed as build args — they are injected at runtime.
# The image is built clean with no secrets.
docker build \
  --platform linux/amd64 \
  --tag "${FULL_IMAGE}" \
  --tag "${LATEST_IMAGE}" \
  .

echo "✓ Image built: ${FULL_IMAGE}"

# ── 3. Push to registry ───────────────────────────────────────────────────────
docker push "${FULL_IMAGE}"
docker push "${LATEST_IMAGE}"

echo "✓ Pushed to registry"

# ── 4. Deploy to cluster ──────────────────────────────────────────────────────
# Option A: kubectl (uncomment if deploying to Kubernetes)
# kubectl set image deployment/${DEPLOYMENT_NAME} \
#   ${DEPLOYMENT_NAME}=${FULL_IMAGE} \
#   --namespace=${NAMESPACE}
# kubectl rollout status deployment/${DEPLOYMENT_NAME} --namespace=${NAMESPACE}

# Option B: docker-compose / Portainer / Coolify / Dokku
# Replace this block with your cluster's actual deploy command.
# The important pattern is: Doppler injects secrets at container start, not build time.
#
# Example for a docker run on a remote host:
# ssh deploy@your-host "
#   doppler run \
#     --project ${DOPPLER_PROJECT} \
#     --config ${DOPPLER_CONFIG} \
#     -- docker run -d \
#       --name ${DEPLOYMENT_NAME} \
#       --restart unless-stopped \
#       -p 3000:3000 \
#       ${FULL_IMAGE}
# "

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Deploy complete"
echo "  Image : ${FULL_IMAGE}"
echo "  Tag   : ${TAG}"
echo "  Doppler: ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

Make the script executable: `chmod +x scripts/deploy-production.sh`

### How Doppler injects secrets at runtime

The script deliberately leaves Step 4 as a commented template because the injection pattern depends on the cluster type. The two canonical patterns are:

**Pattern A — Doppler CLI sidecar (any Docker host)**
```bash
doppler run --project immo-ai-demo --config production \
  -- docker run -d --name immo-ai-demo -p 3000:3000 registry.your-cluster.com/immo-ai-demo:abc1234
```
Doppler injects `ANTHROPIC_API_KEY` and other vars into the container's environment at start. The image has no secrets in it.

**Pattern B — Kubernetes with Doppler operator**
Install the [Doppler Kubernetes Operator](https://docs.doppler.com/docs/kubernetes-operator). It syncs secrets from Doppler into a Kubernetes `Secret` object, which is then mounted as environment variables in the pod spec. The deploy step becomes a standard `kubectl set image` rollout.

Claude Code should implement Pattern A in the script by default (it works on any Docker host), with Pattern B documented in a comment for when the cluster is Kubernetes.

---

## Updated package.json

```json
{
  "name": "rodcast",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "deploy": "./scripts/deploy-production.sh"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "express": "^4.18.0",
    "ws": "^8.16.0",
    "dotenv": "^16.0.0"
  }
}
```

Note: `dotenv` is still in dependencies for convenience during local dev as a fallback. In production the container never loads a `.env` file — Doppler provides the environment directly.

---


## Error handling expectations

- If the Claude API call fails, send a fallback message to the chat: *"Désolée, je rencontre une difficulté technique. Jean-Thomas vous contactera sous peu."*
- If a WebSocket client disconnects, remove it from the client set silently
- If the extraction JSON parse fails, skip the lead update silently — don't crash
- No user-facing error codes or stack traces

---

## What NOT to build

Do not build any of the following — they are out of scope for this demo:

- User authentication or login
- Database or persistent storage of any kind
- Multiple simultaneous conversations (one conversation at a time is fine)
- Appointment booking or calendar integration
- SMS or WhatsApp integration
- CRM sync
- File uploads
- Admin panel
- Unit tests

---

## Definition of done

The demo is complete when:

1. `npm start` runs without errors given a valid `ANTHROPIC_API_KEY`
2. Opening `/chat` on a phone and typing a message in French gets a streamed AI response within 3 seconds
3. Opening `/agent` on a desktop shows the same conversation live
4. The lead profile panel populates correctly after 2–3 exchanges
5. Clicking Intervenir and sending a message shows it instantly on `/chat` with agent styling
6. The whole flow works on a standard wifi connection with no perceptible lag on the WebSocket updates
7. `docker build` succeeds and produces a working image with no secrets baked in
8. `GET /health` returns `200 { status: "ok" }`
9. `doppler run -- npm run dev` works locally with no `.env` file present
10. `./scripts/deploy-production.sh` runs end-to-end without errors (registry and cluster vars configured)
