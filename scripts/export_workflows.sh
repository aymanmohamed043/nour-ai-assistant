#!/usr/bin/env bash
# Export n8n workflows and strip anything private (credentials, ids, webhook ids, pinned data),
# then clean names and internal wording with scripts/clean_workflow.mjs.
# Usage: N8N_URL=https://your-n8n N8N_API_KEY=xxx ./scripts/export_workflows.sh <workflowId> [...]
set -euo pipefail
mkdir -p workflows
for id in "$@"; do
  json=$(curl -sS --fail-with-body --retry 5 --retry-delay 2 --retry-all-errors -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows/$id")
  json=$(echo "$json" | jq 'del(.id, .versionId, .activeVersionId, .activeVersion, .meta, .pinData, .shared, .tags, .staticData)
    | .nodes |= map(del(.credentials, .webhookId, .id))' | node scripts/clean_workflow.mjs)
  name=$(echo "$json" | jq -r '.name' | tr ' ·()' '_' | tr -s '_' | sed 's/_$//')
  echo "$json" > "workflows/${name}.json"
  echo "saved workflows/${name}.json"
done
echo "Before pushing:  grep -rniE 'api[_-]?key|bearer|password|ghp_|eyJhbGci|172\.|192\.168' workflows/ || echo clean"
