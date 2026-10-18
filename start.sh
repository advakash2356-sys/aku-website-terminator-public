#!/usr/bin/env bash
# Aku, the Website Terminator — start the local UI at http://127.0.0.1:4000
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node 20+ (https://nodejs.org)"; exit 1; }
[ -d node_modules ] || npm install
npx playwright-core install chromium >/dev/null 2>&1 || npx playwright-core install chromium
# Local, full-featured mode (GitHub repo audits, history, memory file). The default without this flag is hardened PUBLIC mode.
export AKU_PUBLIC=0
exec node ui/server.js
