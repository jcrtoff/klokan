#!/usr/bin/env bash
set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT:-rodcast}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev}"

ensure_postgres() {
  if ! command -v docker &>/dev/null; then
    echo "Docker is required for local PostgreSQL."
    exit 1
  fi

  if docker ps --format '{{.Names}}' | grep -q '^rodcast-postgres$'; then
    echo "  Postgres already running."
    return
  fi

  if docker ps -a --format '{{.Names}}' | grep -q '^rodcast-postgres$'; then
    echo "  Starting existing Postgres container..."
    docker start rodcast-postgres
  else
    echo "  Creating Postgres container..."
    docker run -d \
      --name rodcast-postgres \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=rodcast \
      -p 37804:5432 \
      postgres:16
  fi

  echo "  Waiting for Postgres..."
  until docker exec rodcast-postgres pg_isready -U postgres &>/dev/null; do
    sleep 0.5
  done
  echo "  Postgres is ready."
}

# Free port 3000 if occupied
lsof -ti :3000 | xargs kill 2>/dev/null || true

echo "▶ Starting RodCast (local dev)"
echo "  Doppler: ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}"

ensure_postgres

echo "  Running Prisma migrations..."
export DATABASE_URL="postgresql://postgres:postgres@localhost:37804/rodcast"
npx prisma migrate deploy
npx prisma generate

doppler run \
  --project "${DOPPLER_PROJECT}" \
  --config "${DOPPLER_CONFIG}" \
  -- env DATABASE_URL="${DATABASE_URL}" npm run dev
