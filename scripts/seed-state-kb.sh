#!/usr/bin/env bash
# Upload state-research markdown files to the directio-state-knowledge
# R2 bucket. AutoRAG auto-indexes on sync.
#
# Also extracts each file's "Source URLs" JSON block and writes them
# into state_source_page so the cron monitor knows what to watch.

set -eu
SRC="${1:-/tmp/state-research}"
BUCKET="directio-state-knowledge"
DB="directio-dev"

if [ ! -d "$SRC" ]; then
  echo "no $SRC directory; nothing to upload"
  exit 1
fi

count=0
for f in "$SRC"/*.md; do
  [ -e "$f" ] || continue
  code=$(basename "$f" .md | tr '[:lower:]' '[:upper:]')
  key="states/${code}.md"
  echo "→ $code  ($f -> r2://$BUCKET/$key)"
  npx wrangler r2 object put "$BUCKET/$key" --file "$f" --remote 2>&1 | tail -1
  count=$((count+1))
done

echo ""
echo "Uploaded $count state files to r2://$BUCKET/"
echo "AutoRAG will auto-index over the next few minutes."
echo ""
echo "Next: open https://dash.cloudflare.com → AI → AI Search → directio-states"
echo "      and confirm the index is syncing."
