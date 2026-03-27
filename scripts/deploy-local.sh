#!/usr/bin/env bash
set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT:-klokan}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev}"

ensure_postgres() {
  if ! command -v docker &>/dev/null; then
    echo "Docker is required for local PostgreSQL."
    exit 1
  fi

  if docker ps --format '{{.Names}}' | grep -q '^klokan-postgres$'; then
    if nc -z localhost 37804 2>/dev/null; then
      echo "  Postgres already running."
      return
    fi
    echo "  Postgres running but port not bound, restarting..."
    docker restart klokan-postgres
  elif docker ps -a --format '{{.Names}}' | grep -q '^klokan-postgres$'; then
    echo "  Starting existing Postgres container..."
    docker start klokan-postgres
  else
    echo "  Creating Postgres container..."
    lsof -ti :37804 | xargs kill 2>/dev/null || true
    docker run -d \
      --name klokan-postgres \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=klokan \
      -p 37804:5432 \
      postgres:16
  fi

  echo "  Waiting for Postgres..."
  until docker exec klokan-postgres pg_isready -U postgres &>/dev/null && nc -z localhost 37804 2>/dev/null; do
    sleep 0.5
  done
  echo "  Postgres is ready."
}

# Free app port if occupied
lsof -ti :3000 | xargs kill 2>/dev/null || true

echo "▶ Starting Klokan (local dev)"
echo "  Doppler: ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}"

ensure_postgres

echo "  Installing dependencies..."
npm install

echo "  Running Prisma migrations..."
export DATABASE_URL="postgresql://postgres:postgres@localhost:37804/klokan"
npx prisma migrate deploy
npx prisma generate

doppler run \
  --project "${DOPPLER_PROJECT}" \
  --config "${DOPPLER_CONFIG}" \
  -- env DATABASE_URL="${DATABASE_URL}" npm run dev
