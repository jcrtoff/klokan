# Klokan

Real-time AI real estate assistant demo. AI assistant qualifies leads for brokers. Multi-broker support with passwordless auth. Bilingual French/English.

## Tech stack

- **Runtime**: Node.js 25, Express 4, WebSocket (`ws`)
- **AI**: Anthropic Codex API (`@anthropic-ai/sdk`), chat model `Codex-sonnet-4-6`, extraction model `Codex-haiku-4-5-20251001`
- **DB**: PostgreSQL 16 via Prisma ORM
- **Auth**: Passwordless OTP via Brevo email, JWT sessions
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Infra**: Docker, AWS ECR, CloudFormation/SAM

## Architecture

Single `server.js` process runs both an Express HTTP server and a WebSocket server on the same port. Code is organized into `lib/` modules.

- **`/chat`** — mobile-first client UI for end users. Supports `?broker=<id>` for pre-assignment. Protected by HTTP Basic Auth when `CHAT_BASIC_AUTH` is set.
- **`/broker`** — desktop dashboard for brokers (courtiers). Requires auth.
- **`/broker/login`** — passwordless login page (email → OTP code → JWT)
- **`/health`** — health check endpoint
- **`/api/version`** — returns commit SHA
- **`/api/auth/*`** — auth endpoints (request-code, verify, me)
- **WebSocket flow**: clients identify as `chat` or `broker` role. Broker connections require JWT. User messages trigger Codex streaming responses. Brokers can send messages directly (no AI response triggered). Lead profile extraction runs async after each AI response.
- **State**: PostgreSQL for persistent data (brokers, sessions, messages, OTP codes). In-memory Map as hot cache for active sessions (WS connections, streaming state). Sessions loaded from DB on demand.
- **Visibility**: Role-based — brokers see only their assigned sessions + unassigned. Managers see all.
- **Session assignment**: Pre-assigned via `/chat?broker=<id>`, or broker claims from queue ("Prendre en charge").

## Key files

| File | Purpose |
|---|---|
| `server.js` | Express + WS server bootstrap (slim orchestrator) |
| `lib/db.js` | Prisma client initialization |
| `lib/auth.js` | OTP generation/verification, JWT, Brevo email |
| `lib/routes.js` | Express route handlers (auth + static) |
| `lib/sessions.js` | Session CRUD, in-memory cache + DB sync |
| `lib/websocket.js` | WS message handling, filtered broadcast |
| `lib/Codex.js` | Codex streaming, lead extraction, system prompt |
| `prisma/schema.prisma` | Database schema (models, no URL — Prisma 7) |
| `prisma.config.ts` | Prisma 7 config — provides `DATABASE_URL` to migrations and client |
| `public/chat.html` | Mobile client chat UI |
| `public/broker.html` | Broker dashboard |
| `public/login.html` | Passwordless login page |
| `public/style.css` | Shared styles |
| `scripts/deploy-local.sh` | Local dev with Doppler + Docker PostgreSQL |
| `scripts/deploy-production.sh` | Wrapper for `infra/push-image.sh prd` |
| `infra/template.yaml` | CloudFormation — ECR repos |
| `infra/push-image.sh` | Build Docker image, push to ECR |
| `Dockerfile` | Node 20 Alpine, Prisma migrate on start |

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Codex API key |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Prod | random bytes | JWT signing secret |
| `BREVO_API_KEY` | Prod | — | Brevo SMTP API key. Unset = OTP logged to console |
| `BREVO_SENDER_EMAIL` | No | `noreply@klokan.live` | Email sender address |
| `BREVO_SENDER_NAME` | No | `Klokan` | Email sender display name |
| `DEFAULT_BROKER_NAME` | No | `Rod` | Name in system prompt for unassigned sessions |
| `PORT` | No | `3000` | Server port |
| `COMMIT_SHA` | No | `dev` | Set at Docker build time |
| `CHAT_BASIC_AUTH` | No | — | `user:password` — if set, `/chat` requires HTTP Basic Auth |

## Local development

```bash
# With Doppler (recommended):
./scripts/deploy-local.sh

# Or manually:
docker start klokan-postgres  # or create with deploy-local.sh first
cp .env.example .env           # fill in ANTHROPIC_API_KEY
npx prisma migrate deploy
npm run dev
```

`deploy-local.sh` ensures PostgreSQL is running (Docker on port 37804), installs npm dependencies, runs migrations, then starts the app via Doppler.

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
- Prisma migrations run automatically on container start
- `DATABASE_URL`, `JWT_SECRET`, `BREVO_API_KEY` injected via Doppler at runtime

## Conventions

- No secrets in Docker image or git — use Doppler or env vars at runtime
- `set -euo pipefail` in all shell scripts
- Non-root Docker user (`app`)
- Git SHA embedded in image for build tracking (`COMMIT_SHA`)
- Ticket prefix: `KK-XX` (previously `ROD-XX`)
