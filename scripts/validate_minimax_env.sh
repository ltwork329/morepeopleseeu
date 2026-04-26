#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  SVAF_TTS_PROVIDER
  MINIMAX_API_KEY
  MINIMAX_BASE_URL
  MINIMAX_TTS_ENDPOINT
  MINIMAX_TTS_MODEL
  MINIMAX_VOICE_ID
  MINIMAX_AUDIO_FORMAT
  MINIMAX_SAMPLE_RATE
  MINIMAX_TIMEOUT_S
)

missing=0

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "[MISSING] $var_name"
    missing=1
  else
    echo "[OK] $var_name"
  fi
done

if [[ "${SVAF_TTS_PROVIDER:-}" != "minimax_intl" ]]; then
  echo "[ERROR] SVAF_TTS_PROVIDER 必须是 minimax_intl"
  exit 2
fi

if [[ "$missing" -ne 0 ]]; then
  echo "[FAILED] 环境变量不完整"
  exit 1
fi

echo "[PASS] MiniMax 国际版 TTS 环境变量已就绪"
