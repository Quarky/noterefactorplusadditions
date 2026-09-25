#!/bin/bash
set -euo pipefail

DEFAULT_VAULT_ROOT="/Users/somed/Documents/obs/shadowrun"
VAULT_ROOT="${1:-$DEFAULT_VAULT_ROOT}"
PLUGIN_ID="note-refactor-plus"
PLUGIN_DIR="$VAULT_ROOT/.obsidian/plugins/$PLUGIN_ID"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

echo "Note Refactor Plus Additions installer"
echo "Vault root: $VAULT_ROOT"
echo "Plugin directory: $PLUGIN_DIR"

if [[ ! -d "$VAULT_ROOT" ]]; then
  echo "ERROR: Vault root does not exist: $VAULT_ROOT" >&2
  exit 1
fi

if [[ ! -d "$VAULT_ROOT/.obsidian" ]]; then
  echo "ERROR: .obsidian was not found under the vault root:" >&2
  echo "       $VAULT_ROOT/.obsidian" >&2
  exit 1
fi

for file in main.js manifest.json styles.css; do
  if [[ ! -f "$SCRIPT_DIR/$file" ]]; then
    echo "ERROR: Missing $file next to install.sh" >&2
    exit 1
  fi
done

mkdir -p "$PLUGIN_DIR"

# Back up only the plugin program files. Existing data.json/settings are left untouched.
if [[ -f "$PLUGIN_DIR/main.js" || -f "$PLUGIN_DIR/manifest.json" || -f "$PLUGIN_DIR/styles.css" ]]; then
  BACKUP_DIR="$PLUGIN_DIR/backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  for file in main.js manifest.json styles.css; do
    if [[ -f "$PLUGIN_DIR/$file" ]]; then
      cp -p "$PLUGIN_DIR/$file" "$BACKUP_DIR/$file"
    fi
  done
  echo "Backed up previous plugin files to:"
  echo "  $BACKUP_DIR"
fi

cp -f "$SCRIPT_DIR/main.js" "$PLUGIN_DIR/main.js"
cp -f "$SCRIPT_DIR/manifest.json" "$PLUGIN_DIR/manifest.json"
cp -f "$SCRIPT_DIR/styles.css" "$PLUGIN_DIR/styles.css"

echo
echo "Installed Note Refactor Plus Additions successfully."
echo "Existing data.json/settings were preserved."
echo
echo "Now reload Obsidian, or disable and re-enable Note Refactor Plus."
