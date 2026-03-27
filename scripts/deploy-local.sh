#!/usr/bin/env bash
set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT:-klokan}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-klokan-postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-37804}"

wait_for_postgres() {
  local deadline=$((SECONDS + 60))

  echo "  Waiting for Postgres..."
  while ! nc -z "${POSTGRES_HOST}" "${POSTGRES_PORT}" &>/dev/null; do
    if (( SECONDS >= deadline )); then
      echo "  Postgres did not become ready within 60s."
      echo "  Container status:"
      docker ps -a --filter name="${POSTGRES_CONTAINER}" --format '    {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
      echo "  Inspect:"
      docker inspect "${POSTGRES_CONTAINER}" --format '    Status={{.State.Status}} Running={{.State.Running}} ExitCode={{.State.ExitCode}} Error={{.State.Error}}' || true
      echo "  Recent logs:"
      docker logs --tail 50 "${POSTGRES_CONTAINER}" || true
      exit 1
    fi
    sleep 0.5
  done
  echo "  Postgres is ready."
}

ensure_postgres() {
  if ! command -v docker &>/dev/null; then
    echo "Docker is required for local PostgreSQL."
    exit 1
  fi

  if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    if nc -z "${POSTGRES_HOST}" "${POSTGRES_PORT}" 2>/dev/null; then
      echo "  Postgres already running."
      return
    fi
    echo "  Postgres running but port not bound, recreating..."
    docker rm -f "${POSTGRES_CONTAINER}" >/dev/null
  elif docker ps -a --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    echo "  Starting existing Postgres container..."
    if nc -z "${POSTGRES_HOST}" "${POSTGRES_PORT}" 2>/dev/null; then
      echo "  Postgres already running."
      return
    fi
    echo "  Existing container has no published port, recreating..."
    docker rm "${POSTGRES_CONTAINER}" >/dev/null
  else
    echo "  Creating Postgres container..."
  fi

  lsof -ti :"${POSTGRES_PORT}" | xargs kill 2>/dev/null || true
  docker run -d \
    --name "${POSTGRES_CONTAINER}" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=klokan \
    -p "${POSTGRES_PORT}:5432" \
    postgres:16

  wait_for_postgres
}

# Free app port if occupied
lsof -ti :3000 | xargs kill 2>/dev/null || true

echo "▶ Starting Klokan (local dev)"
echo "  Doppler: ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}"

ensure_postgres

echo "  Installing dependencies..."
npm install

echo "  Running Prisma migrations..."
export DATABASE_URL="postgresql://postgres:postgres@${POSTGRES_HOST}:${POSTGRES_PORT}/klokan"
npx prisma migrate deploy
npx prisma generate

doppler run \
  --project "${DOPPLER_PROJECT}" \
  --config "${DOPPLER_CONFIG}" \
  -- env DATABASE_URL="${DATABASE_URL}" npm run dev
