#!/usr/bin/env bash
# DockShield SessionStart hook — fires automatically when a Claude Code on the web
# session starts. Reports a one-screen health card so we boot every session knowing:
#   1. Static check + HTML balance (broken syntax = stop everything)
#   2. Dirty files + branch state (don't clobber in-progress work)
#   3. Pointers to error tooling so I don't have to be reminded
#
# Designed to never block — every probe has a soft failure mode and short output.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-/home/user/dockshield}" 2>/dev/null || cd /home/user/dockshield

echo "=== DockShield · Session Health ==="
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
echo "head:   $(git log -1 --oneline 2>/dev/null || echo '?')"

# Static check — broken syntax = stop everything before we waste a session
if node --check public/app.js 2>/tmp/ds-check-err; then
  echo "syntax: OK"
else
  echo "syntax: FAIL  $(head -1 /tmp/ds-check-err)"
fi

# HTML tag balance — fast catch for the common <div> mismatch class of bug
node -e "const h=require('fs').readFileSync('public/index.html','utf8');const o=(h.match(/<div/g)||[]).length,c=(h.match(/<\\/div>/g)||[]).length;console.log('html: div',o,'/',c,o===c?'OK':'MISMATCH')" 2>/dev/null

# Uncommitted work — surface in-progress edits so we don't accidentally clobber
DIRTY=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$DIRTY" -gt 0 ]; then
  echo "dirty: $DIRTY files uncommitted"
  git status --porcelain 2>/dev/null | head -5 | sed 's/^/   /'
else
  echo "dirty: 0"
fi

echo "==================================="
echo "Error tools available without asking:"
echo " - In-browser:  DS.errors()  on dockshield.vercel.app (zero-dep capture)"
echo " - Server-side: mcp__41b2...get_runtime_logs  (live Vercel runtime errors)"
echo " - PR babysit:  PR webhook subscription delivers CI fails + comments"
