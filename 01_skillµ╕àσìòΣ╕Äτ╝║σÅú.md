# 短视频自动化项目 Skill 清单与缺口

## 已有可直接用（与你目标强相关）
| 类别 | Skill |
|---|---|
| 项目记忆与纠偏 | `self-improving-agent` |
| 需求澄清 | `superpowers:brainstorming` |
| 需求文档 | `write-a-prd` |
| 执行规划 | `superpowers:writing-plans` |
| 前端工作台 | `frontend-design` |
| 技能发现 | `find-skills` |
| 技能编写 | `skill-creator` |
| Web 流程验收 | `gstack` / `gstackskill` |
| GitHub 协作 | `github:github` + `github-proactive-agent` |

## 缺口（按你当前规则对照）
| 缺口项 | 当前状态 | 处理建议 |
|---|---|---|
| `hermes-agent` | 未发现该 skill | 先用当前主代理执行；后续补一个同名编排 skill |
| `planning-with-files` | 未发现该 skill | 已用 `task_plan.md/progress.md/findings.md` 替代 |
| `gsd-method-guide` | 未发现该 skill | 在 `task_plan.md` 里用 `<files>/<action>/<verify>/<done>` 格式替代 |

## 建议新增的业务专用 Skill（最关键）
| 新 Skill 名 | 用途 | 最小输入 | 最小输出 |
|---|---|---|---|
| `sv-script-pipeline` | 批量文案生成与脚本标准化 | 主题、受众、平台、时长 | 可拍摄脚本（分镜+台词） |
| `sv-tts-director` | 音色/语速/停顿参数治理 | 文案、音色库、情绪标签 | 可直接合成的 TTS 参数集 |
| `sv-minimax-tts` | MiniMax 国际版语音接入与参数映射 | 文案、音色、速度、格式 | 可调用的 MiniMax TTS 请求与音频产物 |
| `sv-auto-editor` | 自动剪辑编排（镜头/字幕/BGM） | 脚本、音频、素材池、模板 | 可渲染时间轴或工程文件 |
| `sv-qc-gate` | 批量质检与拦截 | 成片、规则库 | 通过/拦截 + 问题清单 |
| `sv-publisher` | 多平台导出与发布计划 | 成片、平台规格、发布时间 | 发布任务队列与状态回执 |
| `sv-ops-dashboard` | 产能、失败率、时延监控 | 任务日志、状态流 | 日/周报和告警 |

## 优先级（先做这 3 个）
1. `sv-auto-editor`
2. `sv-qc-gate`
3. `sv-script-pipeline`

原因：这 3 个决定“能不能稳定批量出片”。
