#!/usr/bin/env bash
set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT:-rodcast}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev}"

# Free port 3000 if occupied
lsof -ti :3000 | xargs kill 2>/dev/null || true

echo "▶ Starting RodCast (local dev)"
echo "  Doppler: ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}"

doppler run \
  --project "${DOPPLER_PROJECT}" \
  --config "${DOPPLER_CONFIG}" \
  -- npm run dev
