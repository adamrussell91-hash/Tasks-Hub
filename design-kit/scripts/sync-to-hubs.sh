#!/usr/bin/env bash
# Copy the kit into each hub so Cursor sees it inside that workspace.
set -euo pipefail

KIT="$(cd "$(dirname "$0")/.." && pwd)"
HUBS=(
  "/Users/adamrussell/Teaching Hub"
  "/Users/adamrussell/Documents/Claude/Projects/life-hub"
  "/Users/adamrussell/Documents/Codex/2026-08-13/files-mentioned-by-the-user-2026/outputs/knowledge-hub"
)

copy_kit() {
  local dest="$1/design-kit"
  mkdir -p "$dest/snippets"
  cp "$KIT/AGENTS.md" "$dest/AGENTS.md"
  cp "$KIT/TASKS.md" "$dest/TASKS.md"
  cp "$KIT/css/tokens.css" "$dest/tokens.css"
  cp "$KIT/css/overlays.css" "$dest/overlays.css"
  cp "$KIT/css/chrome.css" "$dest/chrome.css"
  cp "$KIT/css/actions.css" "$dest/actions.css"
  cp "$KIT/css/sign-in.css" "$dest/sign-in.css"
  cp "$KIT/snippets/"*.html "$dest/snippets/"
  echo "Synced $dest"
}

for hub in "${HUBS[@]}"; do
  if [[ -d "$hub" ]]; then
    copy_kit "$hub"
  else
    echo "Skip (missing): $hub" >&2
  fi
done
