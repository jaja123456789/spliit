#!/bin/bash

set -euxo pipefail

npx prisma migrate deploy

# Patch basePath from env variable
# The exact placeholder string used in next.config.mjs
PLACEHOLDER="/___SPLIIT_BASE_PATH_PLACEHOLDER___"

# Determine the new value
if [ -z "$NEXT_PUBLIC_BASE_PATH" ]; then
  REPLACEMENT=""
  echo "NEXT_PUBLIC_BASE_PATH is not set. Removing placeholder..."
else
  REPLACEMENT="$NEXT_PUBLIC_BASE_PATH"
  echo "Setting base path to: $REPLACEMENT"
fi

find . -type f \( -name "*.gz" -o -name "*.br" \) -delete
grep -rl "$PLACEHOLDER" .next public server.js 2>/dev/null | xargs sed -i "s|$PLACEHOLDER|$REPLACEMENT|g"

echo "Configuration applied. Starting server..."

exec node server.js
