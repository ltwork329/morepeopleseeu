# 网页可访问式必备 Skills（已补全）

## 结论
已补全一套网页生产级 skill 组合，覆盖：产品构建、设计实现、自动化测试、安全监控、部署上线。

## 已安装清单
| 类别 | Skill | 用途 |
|---|---|---|
| Web 应用开发 | `chatgpt-apps` | 网页应用形态与 Apps 集成开发 |
| OpenAI 官方文档 | `openai-docs` | 最新 API/模型文档与实现参考 |
| 设计接入 | `figma-use` | Figma 工具链入口（先决 skill） |
| 设计生成 | `figma-generate-design` | 页面/视图设计生成 |
| 设计实现 | `figma-implement-design` | Figma 到代码落地 |
| 设计系统 | `figma-generate-library` | 组件库与设计系统搭建 |
| 设计规则 | `figma-create-design-system-rules` | 设计规范规则生成 |
| 自动化回归 | `playwright` | 浏览器自动化流程验证 |
| 交互调试 | `playwright-interactive` | 持久会话 UI 调试 |
| 证据截图 | `screenshot` | 网页问题复现与验收证据 |
| 发布部署 | `vercel-deploy` | Vercel 部署 |
| 发布部署 | `netlify-deploy` | Netlify 部署 |
| 发布部署 | `cloudflare-deploy` | Cloudflare 部署 |
| 发布部署 | `render-deploy` | Render 部署 |
| 线上监控 | `sentry` | 前端异常/性能监控 |

## 你这个项目的建议组合（短视频 Web 工作台）
1. 开发：`chatgpt-apps` + `openai-docs`
2. 前端设计与还原：`figma-use` + `figma-generate-design` + `figma-implement-design`
3. 测试验收：`playwright` + `playwright-interactive` + `screenshot`
4. 发布上线：先选一个平台（推荐先 `vercel-deploy`），跑通后再补其他平台
5. 稳定性：`sentry`

## 注意
- 新装 skill 建议重启 Codex 后再用。
- 若只选一个部署平台，先选你最熟的平台，避免重复运维成本。

