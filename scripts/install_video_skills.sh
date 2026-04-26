#!/usr/bin/env bash
set -euo pipefail

SKILL_INSTALLER="/Users/Zhuanz/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py"
LISTER="/Users/Zhuanz/.codex/skills/.system/skill-installer/scripts/list-skills.py"

python3 "$SKILL_INSTALLER" \
  --repo openai/skills \
  --path \
  skills/.curated/sora \
  skills/.curated/speech \
  skills/.curated/transcribe \
  skills/.curated/playwright \
  skills/.curated/playwright-interactive \
  skills/.curated/screenshot

python3 "$LISTER" --format json

echo "Installed video skills. Please restart Codex to pick up new skills."

