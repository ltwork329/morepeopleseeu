#!/usr/bin/env bash
set -euo pipefail

SKILL_INSTALLER="/Users/Zhuanz/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py"
LISTER="/Users/Zhuanz/.codex/skills/.system/skill-installer/scripts/list-skills.py"

python3 "$SKILL_INSTALLER" \
  --repo openai/skills \
  --path \
  skills/.curated/chatgpt-apps \
  skills/.curated/openai-docs \
  skills/.curated/figma-use \
  skills/.curated/figma-generate-design \
  skills/.curated/figma-implement-design \
  skills/.curated/figma-generate-library \
  skills/.curated/figma-create-design-system-rules \
  skills/.curated/playwright \
  skills/.curated/playwright-interactive \
  skills/.curated/screenshot \
  skills/.curated/vercel-deploy \
  skills/.curated/netlify-deploy \
  skills/.curated/cloudflare-deploy \
  skills/.curated/render-deploy \
  skills/.curated/sentry

python3 "$LISTER" --format json

echo "Installed web skills. Please restart Codex to pick up new skills."

