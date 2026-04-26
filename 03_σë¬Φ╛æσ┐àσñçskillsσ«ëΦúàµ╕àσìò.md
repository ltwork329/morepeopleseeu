# 剪辑必备 Skills 安装清单（已落地）

## 结论
已安装 6 个与你“文案 -> 音频 -> 视频 -> 验证”最相关的技能，并纳入本项目规范。

## 已安装清单
| Skill | 用途 | 安装状态 | 安装位置 |
|---|---|---|---|
| `speech` | 文案转配音（TTS） | 已安装 | `/Users/Zhuanz/.codex/skills/speech` |
| `transcribe` | 音视频转文字/说话人分离（校对字幕） | 已安装 | `/Users/Zhuanz/.codex/skills/transcribe` |
| `sora` | AI 视频生成/延展/编辑（素材与镜头补齐） | 已安装 | `/Users/Zhuanz/.codex/skills/sora` |
| `playwright` | 浏览器自动化（工作台流程回归） | 已安装 | `/Users/Zhuanz/.codex/skills/playwright` |
| `playwright-interactive` | 持久会话交互调试（复杂 UI 流程） | 已安装 | `/Users/Zhuanz/.codex/skills/playwright-interactive` |
| `screenshot` | 证据截图（验收与问题复现） | 已安装 | `/Users/Zhuanz/.codex/skills/screenshot` |

## 在你项目里的推荐使用顺序
1. `speech`：先把脚本稳定转成配音
2. `sv-auto-editor`（你后续要创建）：将配音 + 素材 + 模板合成视频
3. `transcribe`：回写字幕，做对齐和质检
4. `sora`：素材不足时补镜头或扩展片段
5. `playwright` / `playwright-interactive`：对运营工作台做端到端验证
6. `screenshot`：输出验证证据

## 注意
- 使用这些新安装的 skill 前，建议重启一次 Codex 会话（让新技能稳定生效）。
- `speech`、`transcribe`、`sora` 需要本机配置 `OPENAI_API_KEY`。

