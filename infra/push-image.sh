#!/usr/bin/env bash
set -euo pipefail

ENV="${1:?Usage: ./push-image.sh <dev|prd>}"

if [[ "$ENV" != "dev" && "$ENV" != "prd" ]]; then
  echo "Error: environment must be 'dev' or 'prd'" >&2
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")
REPO="rodcast-${ENV}"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}"

echo "Logging into ECR..."
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GIT_SHA=$(git rev-parse --short HEAD)

echo "Building image (SHA=${GIT_SHA})..."
docker buildx build --platform linux/amd64 \
  --build-arg "COMMIT_SHA=${GIT_SHA}" \
  -t "$REPO" --load "${SCRIPT_DIR}/.."

echo "Tagging and pushing to ${ECR_URI}..."
docker tag "$REPO:latest" "$ECR_URI:latest"
docker push "$ECR_URI:latest"

echo "Done. Image pushed to ${ECR_URI}:latest"

if [[ "$ENV" == "prd" ]]; then
  "${SCRIPT_DIR}/../scripts/trigger_cluster_deploy.sh"
  git commit --allow-empty -m "Deployed to production"
  git push
fi
