# task_plan

## 当前目标
完成短视频“文案->音频->视频”批量自动剪辑项目的基础准备与规范落地。

## 任务分解（`<files>/<action>/<verify>/<done>`）
| files | action | verify | done |
|---|---|---|---|
| `00_项目基线规范.md` | 定义边界、角色权限、状态机、备份、测试基线 | 检查是否覆盖全链路与必选治理点 | yes |
| `01_skill清单与缺口.md` | 盘点现有 skill、缺口和建议新增 skill | 对照必备 skill 列表检查缺失项 | yes |
| `02_批量自动剪辑实施路线图.md` | 输出 0-3 阶段执行计划与验收口径 | 检查是否可按周执行且可验收 | yes |
| `03_剪辑必备skills安装清单.md` | 安装并登记短视频核心 skills | 用安装脚本与安装列表二次核验 | yes |
| `scripts/install_video_skills.sh` | 固化可重复安装入口 | 赋可执行权限并验证路径存在 | yes |
| `04_网页必备skills安装清单.md` | 补全网页生产级 skills 清单 | 检查清单覆盖开发/设计/测试/部署/监控 | yes |
| `scripts/install_web_skills.sh` | 固化网页技能一键安装入口 | 执行权限与脚本路径检查 | yes |
| `05_语音补充_minimax国际版接入规范.md` | 增补 MiniMax 国际版语音规范 | 检查变量、流程、错误码字段完整性 | yes |
| `configs/tts_minimax.env.example` | 固化 MiniMax 环境变量模板 | 校验关键变量是否齐全 | yes |
| `scripts/validate_minimax_env.sh` | 增加 MiniMax 环境变量校验 | 脚本执行权限与逻辑验证 | yes |
| `skills/sv-minimax-tts/SKILL.md` | 新增项目内语音专用 skill | 检查输入输出与约束定义完整 | yes |

## 下一步（待执行）
1. 生成仓库目录骨架（api/worker/editor/qc/dashboard/docs）
2. 固化错误码和任务状态枚举
3. 建立第一条可运行 MVP 管线（10 条样本任务）
