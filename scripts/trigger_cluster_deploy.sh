#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOKEN_FILE="$PROJECT_ROOT/.cluster_api_token"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Error: $TOKEN_FILE not found" >&2
  exit 1
fi

echo "Triggering cluster deploy..."
echo "Endpoint: POST https://cluster.toffsystems.com/deploy"
echo ""
echo "Streaming deployment logs:"
echo ""

set +e
curl -N -X POST https://cluster.toffsystems.com/deploy \
  -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
  --fail-with-body
CURL_EXIT_CODE=$?
set -e

echo ""
if [[ $CURL_EXIT_CODE -ne 0 ]]; then
  echo "Deploy failed with exit code: $CURL_EXIT_CODE" >&2
  exit $CURL_EXIT_CODE
fi

echo "Deploy complete."
