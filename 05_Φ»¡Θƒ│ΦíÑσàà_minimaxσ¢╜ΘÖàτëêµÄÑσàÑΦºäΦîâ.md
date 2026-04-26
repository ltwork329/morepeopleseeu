# 语音补充：MiniMax 国际版接入规范

## 结论
已将 MiniMax 国际版纳入本项目语音链路。你已有 API，可直接按本文件配置。

## 1. 接入目标
- 在“文案 -> 音频”环节支持 MiniMax 国际版 TTS
- 与现有语音任务结构统一，不新增旁路流程
- 不做兜底分支；由配置决定当前激活供应商

## 2. 必备环境变量
| 变量名 | 说明 |
|---|---|
| `SVAF_TTS_PROVIDER` | 固定为 `minimax_intl` |
| `MINIMAX_API_KEY` | 你的 MiniMax 国际版 API Key |
| `MINIMAX_BASE_URL` | MiniMax 国际版 API 根地址 |
| `MINIMAX_TTS_ENDPOINT` | TTS 完整 endpoint（建议填完整 URL，避免路径歧义） |
| `MINIMAX_TTS_MODEL` | 语音模型标识 |
| `MINIMAX_VOICE_ID` | 默认音色 ID |
| `MINIMAX_AUDIO_FORMAT` | 输出格式，如 `mp3` / `wav` |
| `MINIMAX_SAMPLE_RATE` | 采样率，如 `16000` / `24000` |
| `MINIMAX_TIMEOUT_S` | 请求超时秒数 |

## 3. 统一请求与产物字段
- 输入统一字段：`text`、`voice`、`speed`、`emotion`、`format`、`sample_rate`
- 输出统一字段：`audio_url`、`duration_ms`、`provider`、`model`、`request_id`
- 错误统一字段：`provider_error_code`、`provider_error_message`、`retriable`

## 4. 执行规则
1. 所有语音任务先经过统一参数层，再映射到 MiniMax 实际参数
2. 每条语音任务必须记录 `provider=minimax_intl`
3. 失败必须带原始错误码，不允许只返回“失败”
4. 任务可重放：同输入+同配置必须可复现

## 5. 当前未验证项（明确标注）
- 本仓库尚未写入真实 MiniMax 请求代码（当前是规范与配置底座）
- `MINIMAX_TTS_ENDPOINT` 与 `MINIMAX_TTS_MODEL` 以你账号可用配置为准

