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
