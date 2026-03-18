#!/usr/bin/env bash
set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT:-rodcast}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev}"

echo "▶ Starting RodCast (local dev)"
echo "  Doppler: ${DOPPLER_PROJECT}/${DOPPLER_CONFIG}"

doppler run \
  --project "${DOPPLER_PROJECT}" \
  --config "${DOPPLER_CONFIG}" \
  -- npm run dev
