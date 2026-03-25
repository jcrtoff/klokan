# RodCast

Real-time AI real estate assistant demo. Roxanne (AI) qualifies leads for Rod, a Montreal real estate broker (OACIQ). Bilingual French/English.

## Tech stack

- **Runtime**: Node.js 20, Express 4, WebSocket (`ws`)
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`), chat model `claude-sonnet-4-6`, extraction model `claude-haiku-4-5-20251001`
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Infra**: Docker, AWS ECR, CloudFormation/SAM

## Architecture

Single `server.js` process runs both an Express HTTP server and a WebSocket server on the same port.

- **`/chat`** — mobile-first client UI for end users
- **`/agent`** — desktop dashboard for the broker (Rod)
- **`/health`** — health check endpoint
- **`/api/version`** — returns commit SHA and uptime
- **WebSocket flow**: clients identify as `chat` or `agent` role. User messages trigger Claude streaming responses. Agent (Rod) can send messages directly (no AI response triggered). Lead profile extraction runs async after each AI response.
- **State**: in-memory per-session `sessions` Map (conversation history, lead profile, token/cost tracking per session). No database. Sessions auto-cleanup after 30min inactivity. Resets on restart.

## Key files

| File | Purpose |
|---|---|
| `server.js` | Express + WS server, Claude streaming, lead extraction |
| `public/chat.html` | Mobile client chat UI |
| `public/agent.html` | Agent/broker dashboard |
| `public/style.css` | Shared styles |
| `scripts/deploy-local.sh` | Local dev with Doppler secrets |
| `scripts/deploy-production.sh` | Wrapper for `infra/push-image.sh prd` |
| `infra/template.yaml` | CloudFormation — ECR repos (scan on push, keep last 10 images) |
| `infra/deploy.sh` | Create/update CloudFormation stacks |
| `infra/push-image.sh` | Build Docker image (linux/amd64), push to ECR, trigger cluster deploy for prd |
| `scripts/trigger_cluster_deploy.sh` | Triggers deploy webhook on cluster |
| `Dockerfile` | Node 20 Alpine, non-root user, healthcheck |

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key |
| `PORT` | No | `3000` | Server port |
| `AGENT_NAME` | No | `Rod` | Broker name shown in UI and fallback messages |
| `COMMIT_SHA` | No | `unknown` | Set at Docker build time via build arg |

## Local development

```bash
# With Doppler (recommended):
./scripts/deploy-local.sh

# Or manually with .env:
cp .env.example .env  # fill in ANTHROPIC_API_KEY
npm run dev
```

`deploy-local.sh` kills port 3000 if occupied, then runs `doppler run -- npm run dev` (which uses `node --watch`).

## Deployment

### Infrastructure setup (one-time per env)
```bash
./infra/deploy.sh <dev|prd>   # creates ECR repo via CloudFormation
```

### Deploy to ECR
```bash
./infra/push-image.sh <dev|prd>   # build + push Docker image
./scripts/deploy-production.sh    # shortcut for push-image.sh prd
```

- Docker image built for `linux/amd64` with git SHA as build arg
- ECR repos: `rodcast-dev`, `rodcast-prd`
- For `prd`: triggers deploy webhook at `cluster.toffsystems.com` using token from `.cluster_api_token` (project root)

## Conventions

- No secrets in Docker image or git — use Doppler or env vars at runtime
- `set -euo pipefail` in all shell scripts
- Non-root Docker user (`app`)
- Git SHA embedded in image for build tracking (`COMMIT_SHA`)
