---
name: "sv-minimax-tts"
description: "短视频项目专用：将统一语音参数映射到 MiniMax 国际版 TTS，请求产出标准化音频结果并写入任务日志。"
---

# sv-minimax-tts

## 触发场景
- 用户要求使用 MiniMax 国际版做配音
- 语音链路需要统一参数与统一错误码

## 输入（最小）
- `text`
- `voice`
- `speed`
- `emotion`
- `format`
- `sample_rate`

## 输出（最小）
- `audio_url`
- `duration_ms`
- `provider`（固定 `minimax_intl`）
- `model`
- `request_id`

## 强约束
1. 不允许硬编码 API Key
2. 不允许静默失败，必须回传供应商错误码
3. 只走统一语音任务链路，不新增旁路
4. 显式标记未验证项，不把推断当事实

## 环境变量
- `SVAF_TTS_PROVIDER=minimax_intl`
- `MINIMAX_API_KEY`
- `MINIMAX_BASE_URL`
- `MINIMAX_TTS_ENDPOINT`
- `MINIMAX_TTS_MODEL`
- `MINIMAX_VOICE_ID`
- `MINIMAX_AUDIO_FORMAT`
- `MINIMAX_SAMPLE_RATE`
- `MINIMAX_TIMEOUT_S`
