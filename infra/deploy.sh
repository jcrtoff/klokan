#!/usr/bin/env bash
set -euo pipefail

ENV="${1:?Usage: ./deploy.sh <dev|prd>}"

if [[ "$ENV" != "dev" && "$ENV" != "prd" ]]; then
  echo "Error: environment must be 'dev' or 'prd'" >&2
  exit 1
fi

STACK_NAME="klokan-${ENV}"
TEMPLATE="$(cd "$(dirname "$0")" && pwd)/template.yaml"

echo "Deploying stack ${STACK_NAME}..."

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE" \
  --parameter-overrides "Environment=${ENV}" \
  --no-fail-on-empty-changeset

echo "Stack ${STACK_NAME} deployed."
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs" \
  --output table
