# 多租户积分计费版底层设计

## 1. 目标

在现有本地短视频工作台基础上，扩展为可多租户使用的 SaaS 系统，满足以下核心能力：

- 多租户隔离：不同租户的数据、素材、任务、账单、成员相互隔离。
- 充值积分：租户先充值，再消费积分。
- MiniMax 倍率计费：真实消耗官方 1 分，平台可按 4 倍或其他倍率扣租户积分。
- 管理端：平台管理员管理租户、充值、倍率、订单、消耗、风控。
- 租户端：租户成员上传文案、生成音频、合成视频、查看积分和账单。
- 可审计：每一笔积分变动都能追溯到具体调用、任务、订单和操作人。

这份设计以“最小可上线版本”优先，不追求一次性把所有模块做满。

## 2. 基于现有代码的判断

现有仓库特点：

- 前端：Vite + 原生 JS 单页工作台。
- 后端：`scripts/materials_api.mjs` 单文件 Node HTTP 服务。
- 当前能力：本地文案任务、MiniMax 语音、素材扫描、字幕处理、视频合成。

结论：

- 现有代码适合保留“业务流程和前端交互原型”。
- 不适合直接在单文件 Node 脚本上继续堆多租户、充值、权限、订单、账单。
- 必须补一层正式服务端和数据库模型。

建议路线：

1. 保留现有前端交互和现有音视频处理逻辑。
2. 把 MiniMax 调用、任务状态、积分扣减迁到正式服务端。
3. 将本地 `materials_api.mjs` 拆成业务服务模块。

## 3. 总体架构

建议分为 4 层：

### 3.1 前端层

- 租户端 Web
  - 文案上传
  - 声音管理
  - 生成音频
  - 字幕校对
  - 合成视频
  - 积分余额
  - 消耗记录
  - 充值记录

- 管理端 Web
  - 租户管理
  - 成员管理
  - 套餐/倍率配置
  - 充值审核
  - 消耗审计
  - 风控和封禁

### 3.2 应用服务层

建议拆分成以下服务：

- `auth-service`
  - 登录、JWT、租户成员身份、角色权限

- `tenant-service`
  - 租户资料
  - 租户状态
  - 租户套餐
  - 成员关系

- `billing-service`
  - 充值订单
  - 积分账户
  - 积分流水
  - 倍率扣费
  - 冻结/解冻/补扣/退款

- `media-service`
  - MiniMax 调用代理
  - 音频生成
  - 字幕处理
  - 视频合成
  - 存储路径管理

- `task-service`
  - 文案任务
  - 批次任务
  - 状态流转
  - 重试机制

### 3.3 数据层

- 主库：MySQL 或 PostgreSQL
- 缓存：Redis
- 对象存储：本地磁盘开发，生产建议 S3/OSS/COS
- 队列：Redis Stream / BullMQ / RabbitMQ 任一即可

### 3.4 第三方层

- MiniMax：平台统一代调用，不允许租户直接拿官方 key
- 支付渠道：微信支付 / 支付宝 / 人工充值单

## 4. 多租户隔离模型

建议使用“共享库 + tenant_id 行级隔离”。

原因：

- 当前阶段实现成本最低。
- 后续支持几十到几百租户足够。
- 配合索引、审计、权限即可满足第一阶段。

所有核心业务表必须带：

- `tenant_id`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

查询规则：

- 超级管理员：可跨租户查询。
- 租户管理员/成员：只能查询自己租户下的数据。

## 5. 权限模型

角色建议：

- 平台超级管理员 `platform_super_admin`
- 平台财务 `platform_finance`
- 平台运营 `platform_operator`
- 租户管理员 `tenant_admin`
- 租户操作员 `tenant_operator`
- 租户只读 `tenant_viewer`

权限边界：

- 平台角色管理所有租户、充值、倍率、风控。
- 租户管理员管理本租户成员、查看余额、使用工作台。
- 租户操作员只能操作任务和查看本租户账单。

## 6. 积分账户设计

每个租户一个积分主账户。

核心字段：

- `balance_points`
- `frozen_points`
- `available_points`

计费原则：

- 官方 MiniMax 实际成本为 `provider_cost_points`
- 平台扣租户积分为：

`tenant_charge_points = ceil(provider_cost_points * charge_multiplier)`

示例：

- 官方消耗 1 分
- 平台倍率 4
- 租户扣减 4 分

倍率来源优先级：

1. 租户专属倍率
2. 套餐倍率
3. 平台默认倍率

## 7. 积分流水设计

必须使用双表：

### 7.1 租户积分账户表 `tenant_wallets`

- `tenant_id`
- `balance_points`
- `frozen_points`
- `status`

### 7.2 积分流水表 `wallet_ledger`

- `id`
- `tenant_id`
- `wallet_id`
- `direction` `credit/debit`
- `biz_type`
  - `recharge`
  - `minimax_tts`
  - `minimax_voice_clone`
  - `video_compose`
  - `manual_adjust`
  - `refund`
- `provider_name`
- `provider_cost_points`
- `charge_multiplier`
- `tenant_charge_points`
- `before_balance`
- `after_balance`
- `biz_id`
- `biz_snapshot_json`
- `operator_id`
- `remark`

要求：

- 所有扣减必须记流水。
- 必须能回溯某次 MiniMax 调用对应哪条任务。
- 不允许直接改余额而不记流水。

## 8. 充值设计

### 8.1 充值单表 `recharge_orders`

- `order_no`
- `tenant_id`
- `package_id`
- `pay_amount`
- `gift_points`
- `actual_points`
- `payment_channel`
- `status`
  - `pending`
  - `paid`
  - `cancelled`
  - `refunded`
- `paid_at`
- `confirmed_by`

### 8.2 充值模式

建议支持三种：

1. 人工充值
   - 管理端录入
   - 最适合早期

2. 支付回调充值
   - 支付成功自动加积分

3. 线下转账审核充值
   - 上传凭证
   - 财务审核后加积分

## 9. MiniMax 扣费策略

必须走“预扣 + 结算”模型，不要只做事后扣减。

### 9.1 调用前

- 根据调用类型估算本次最大可能消耗
- 先冻结积分 `freeze_points`

例如：

- 语音克隆估算上限 50 分
- 音频生成估算上限 20 分

### 9.2 调用成功后

- 读取真实 provider 成本
- 按倍率换算租户扣减
- 扣实际积分
- 释放剩余冻结积分

### 9.3 调用失败后

- 全额解冻
- 不扣费
- 记录失败日志

## 10. 成本计量模型

先定义统一计费单元 `provider_cost_points`。

MiniMax 不同接口统一抽象成：

- `voice_clone`
- `tts_generate`
- `tts_preview`
- `file_upload`

如果第三方接口不能直接返回成本，第一阶段采用平台估算规则：

- 按字符数
- 按音频秒数
- 按调用次数
- 按文件大小

后续如果官方提供账单明细，再切换为真实成本回填。

## 11. 任务状态机

### 11.1 文案任务

- `draft`
- `ready_for_tts`
- `tts_processing`
- `tts_success`
- `subtitle_confirmed`
- `compose_processing`
- `compose_success`
- `failed`

### 11.2 扣费状态

- `not_charged`
- `pre_frozen`
- `charged`
- `released`
- `refunded`

任务和扣费必须分开存，不要混在一个状态字段里。

## 12. 数据表建议

### 12.1 身份与租户

- `users`
- `tenants`
- `tenant_members`
- `roles`

### 12.2 充值与钱包

- `tenant_wallets`
- `wallet_ledger`
- `recharge_orders`
- `pricing_packages`
- `tenant_pricing_rules`

### 12.3 媒体与任务

- `content_batches`
- `content_tasks`
- `voices`
- `audio_jobs`
- `subtitle_jobs`
- `compose_jobs`
- `media_files`

### 12.4 第三方调用

- `provider_requests`
- `provider_request_costs`

## 13. 关键表关系

- 一个 `tenant` 有多个 `tenant_members`
- 一个 `tenant` 对应一个 `tenant_wallet`
- 一个 `tenant` 有多个 `content_batches`
- 一个 `content_batch` 有多个 `content_tasks`
- 一个 `content_task` 对应多个作业：
  - `audio_job`
  - `subtitle_job`
  - `compose_job`
- 每个 `provider_request` 可关联一个积分流水

## 14. API 设计建议

### 14.1 租户端

- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/wallet`
- `GET /api/wallet/ledger`
- `GET /api/recharge/orders`
- `POST /api/tasks`
- `POST /api/tasks/import-excel`
- `POST /api/tasks/:id/tts`
- `POST /api/tasks/:id/subtitle-confirm`
- `POST /api/tasks/:id/compose`
- `GET /api/tasks`
- `GET /api/tasks/:id`

### 14.2 管理端

- `GET /admin/tenants`
- `POST /admin/tenants`
- `PATCH /admin/tenants/:id/status`
- `GET /admin/recharge/orders`
- `POST /admin/recharge/orders`
- `POST /admin/recharge/orders/:id/confirm`
- `POST /admin/wallet/adjust`
- `GET /admin/provider-costs`
- `PATCH /admin/tenant-pricing-rules/:tenantId`

## 15. 管理端设计

管理端建议至少 6 个页面：

1. 租户列表
   - 名称
   - 状态
   - 当前余额
   - 当前倍率
   - 最近消费

2. 租户详情
   - 成员
   - 余额
   - 最近任务
   - 最近充值
   - 最近失败

3. 充值管理
   - 待审核
   - 已支付
   - 已取消
   - 已退款

4. 积分流水
   - 充值
   - 扣费
   - 人工调整
   - 退款

5. 定价规则
   - 默认倍率
   - 租户专属倍率
   - 接口级倍率

6. 风控面板
   - 高频调用
   - 余额不足
   - 异常失败
   - 手工封禁

## 16. 租户端设计

租户端建议 5 个主模块：

1. 工作台
   - 沿用当前现有文案上传、音频生成、字幕校对、视频合成流程

2. 余额中心
   - 当前余额
   - 冻结积分
   - 最近消费

3. 充值中心
   - 充值套餐
   - 充值记录
   - 支付状态

4. 账单明细
   - 按任务看扣费
   - 按接口看扣费
   - 按日期汇总

5. 成员管理
   - 仅租户管理员可见

## 17. 现有代码如何拆

### 17.1 前端

当前 `src/main.js` 是单文件。

建议最少拆成：

- `src/app/state`
- `src/app/api`
- `src/modules/tasks`
- `src/modules/audio`
- `src/modules/subtitles`
- `src/modules/compose`
- `src/modules/billing`
- `src/modules/admin`

### 17.2 后端

当前 `scripts/materials_api.mjs` 是单文件。

建议拆成：

- `server/app.js`
- `server/routes/auth.js`
- `server/routes/tasks.js`
- `server/routes/wallet.js`
- `server/routes/admin.js`
- `server/services/minimax-service.js`
- `server/services/billing-service.js`
- `server/services/task-service.js`
- `server/services/compose-service.js`
- `server/repositories/*`

## 18. 存储隔离建议

第一阶段建议所有文件存储路径按租户分目录：

- `storage/tenants/{tenantId}/audio`
- `storage/tenants/{tenantId}/subtitles`
- `storage/tenants/{tenantId}/videos`
- `storage/tenants/{tenantId}/materials`

好处：

- 清理简单
- 排查简单
- 权限和审计清晰

## 19. 风险点

### 19.1 余额并发扣减

必须用事务和乐观锁/悲观锁，避免同时多个任务超扣。

### 19.2 MiniMax 真实成本不透明

第一阶段要允许：

- 估算扣费
- 后续账单回填修正

### 19.3 长任务状态漂移

必须有：

- 任务轮询
- 文件存在性对账
- 作业表和主任务表分离

### 19.4 本地素材模式不适合纯 SaaS

如果要公网多租户，最终要把“素材库”从本地磁盘模式改成：

- 云对象存储
- 或租户上传后统一转存

## 20. 第一阶段实施建议

按最小闭环拆 4 期：

### 第一期：租户与积分底座

- 用户登录
- 租户模型
- 钱包模型
- 充值单
- 流水表
- 管理端可手工充值

### 第二期：MiniMax 代理计费

- 所有 MiniMax 调用必须走平台后端
- 接入预扣/结算
- 租户端显示余额和扣费

### 第三期：任务多租户化

- 文案任务、音频、字幕、视频都带 `tenant_id`
- 文件目录按租户隔离
- 管理端可按租户审计任务

### 第四期：管理端和支付

- 平台管理台
- 自动支付回调
- 倍率规则后台配置

## 21. 技术选型建议

如果继续沿当前仓库演进，建议：

- 前端：保留 Vite，但逐步模块化
- 后端：Node.js + Fastify 或 Express
- ORM：Prisma
- DB：PostgreSQL
- Redis：缓存 + 队列
- 鉴权：JWT + Refresh Token

原因：

- 贴近现有 JS 代码
- 开发成本低
- 后续多人协作成本低

## 22. 关键设计原则

- 租户不能直接接触 MiniMax 官方密钥。
- 积分扣减必须有流水。
- 钱包余额变动必须事务化。
- 任务状态和计费状态分离。
- 页面展示必须以数据库/文件对账结果为准，不能只信前端缓存。
- 管理端和租户端权限边界明确。

## 23. 建议的下一步开发顺序

如果直接进入开发，建议按以下顺序：

1. 建数据库表结构
2. 落 `tenant / user / wallet / ledger / recharge_order`
3. 把 MiniMax 调用改为统一服务代理
4. 给现有任务流加 `tenant_id`
5. 做管理端充值和倍率配置页
6. 做租户端余额中心
7. 最后再把素材和视频合成做成真正 SaaS 化

## 24. 中转站式计费逻辑

你要的不是“租户自己直连 MiniMax”，而是平台做统一中转。

正确模型：

- 平台持有唯一的 MiniMax 官方账号和官方 key
- 所有租户调用都先到平台
- 平台再转发给 MiniMax
- 平台记录真实官方消耗
- 平台按租户规则放大倍率后扣减租户积分

也就是：

`租户 -> 平台中转站 -> MiniMax`

### 24.1 中转站的职责

中转站必须承担以下职责：

1. 租户身份识别
   - 当前是谁调用
   - 属于哪个租户
   - 是否有权限调用当前能力

2. 额度校验
   - 租户余额是否足够
   - 是否超过单次调用上限
   - 是否超过日限额/月限额

3. 真实成本统计
   - 这次请求用了哪个 MiniMax 模型
   - 真实 provider 成本是多少
   - 成本归属到哪个任务/哪个租户

4. 平台倍率计费
   - 按租户配置倍率扣分
   - 允许平台默认 4 倍
   - 允许不同租户不同倍率
   - 允许不同接口不同倍率

5. 风控
   - 高频调用拦截
   - 异常文本或异常文件拦截
   - 余额不足直接拒绝

6. 审计
   - 每次请求都有请求日志
   - 每次扣费都有积分流水
   - 每次失败都有错误记录

### 24.2 中转站接口分层

建议把平台中转接口分成三层：

#### a. 业务接口

给租户端调用：

- `POST /api/copywriting/generate`
- `POST /api/audio/tts`
- `POST /api/voice/clone`
- `POST /api/video/compose`

#### b. 计费网关层

统一做：

- 鉴权
- 余额校验
- 预扣
- 调用日志
- 实际结算

#### c. Provider 适配层

只负责和 MiniMax 通信：

- 组装 MiniMax 请求
- 解析 MiniMax 响应
- 提取真实成本和 trace_id

### 24.3 租户倍率规则

建议支持 3 级倍率：

1. 平台默认倍率
2. 租户倍率
3. 接口级倍率

例如：

- 默认倍率：4
- A 租户倍率：3.5
- B 租户倍率：5
- 文案生成倍率：2
- TTS 倍率：4
- 声音克隆倍率：6

实际扣费公式：

`最终扣减积分 = ceil(真实官方消耗 * 生效倍率)`

### 24.4 管理端必须具备的计费管理能力

管理端至少要能做：

- 新建租户
- 冻结/启用租户
- 设定租户默认倍率
- 设定接口级倍率
- 手工充值
- 手工调账
- 查看调用日志
- 查看积分流水
- 查看单租户总消耗、总充值、毛利

### 24.5 租户端必须具备的消费可视化能力

租户端至少要能看：

- 当前总积分
- 可用积分
- 冻结积分
- 今日消耗
- 本月消耗
- 最近 50 条积分流水
- 每条任务消耗了多少积分

## 25. 文案生成页面设计

你新增的需求不是简单“加一个文本框”，而是一个完整的文案工作台。

目标流程：

`抖音热门视频链接 -> 提取原文案/字幕 -> 生成新文案 -> 多轮修改 -> 定稿 -> 进入音频/视频任务`

### 25.1 页面定位

建议新增页面：

- `文案生成`

侧栏顺序建议：

1. 文案生成
2. 单条-生成音频
3. 单条-合成视频
4. 批量制作
5. 素材库
6. 操作记录

### 25.2 页面结构

页面分 4 块：

#### A. 链接输入区

- 输入抖音链接
- 点击“抓取原视频文案”
- 展示抓取状态

字段：

- 抖音链接
- 平台来源
- 抓取时间
- 抓取状态

#### B. 原文案区

展示抓取出来的内容：

- 视频标题
- 视频简介
- OCR 文本
- ASR 字幕
- 合并后的原始文案

要求：

- 允许人工修正原文案
- 保留原始版本，不覆盖源数据

#### C. 新文案生成区

允许租户输入生成条件：

- 行业/品类
- 语气风格
- 字数限制
- 是否口播化
- 是否带钩子开头
- 是否带行动号召

按钮：

- 生成新文案
- 生成 3 个候选版本
- 基于当前版本继续改写

#### D. 多轮沟通修改区

这里是关键，不是一次生成完就结束。

要支持对话式修改：

- 用户说：太长了，缩短一点
- 用户说：再狠一点，更像老板口播
- 用户说：不要太官方，接地气
- 用户说：保留第一句，后面重写

系统每次修改都要保留版本。

### 25.3 版本模型

文案生成页必须有版本表：

- `copywriting_sessions`
- `copywriting_versions`
- `copywriting_messages`

#### `copywriting_sessions`

表示一次文案会话：

- 来源链接
- 租户
- 创建人
- 当前状态

#### `copywriting_versions`

表示每次产出的一个文案版本：

- version_no
- source_type
  - `original_extracted`
  - `ai_generated`
  - `ai_revised`
  - `manual_edited`
- content
- summary
- is_final

#### `copywriting_messages`

表示修改对话：

- role
  - `user`
  - `assistant`
- content
- version_id

### 25.4 与任务系统的关系

文案生成页不能是孤岛。

定稿后必须支持：

- “作为单条任务创建”
- “加入批量任务池”
- “保存为标题 + 正文”

也就是：

- 文案生成页产出的最终版本
- 可以直接落进 `content_tasks`

### 25.5 抖音链接处理流程

建议拆成：

1. `link-resolver`
   - 解析抖音链接
   - 获取真实视频地址或页面信息

2. `content-extractor`
   - 提取标题/简介
   - 提取字幕
   - 必要时 OCR
   - 必要时 ASR

3. `copywriting-generator`
   - 调用 MiniMax 文本模型
   - 根据原文案和用户要求生成新文案

### 25.6 文案生成接口建议

租户端接口：

- `POST /api/copywriting/extract`
  - 输入：抖音链接
  - 输出：原始标题、简介、字幕、原文案

- `POST /api/copywriting/generate`
  - 输入：原文案 + 生成要求
  - 输出：候选新文案

- `POST /api/copywriting/revise`
  - 输入：当前版本 + 修改意见
  - 输出：新版本

- `POST /api/copywriting/finalize`
  - 输入：version_id
  - 输出：可进入任务系统的标题和正文

### 25.7 文案生成计费建议

文案生成也要走积分扣费。

业务类型增加：

- `copywriting_extract`
- `copywriting_generate`
- `copywriting_revise`

计费口径建议：

- 提取类：按次数或按视频长度计费
- 生成类：按 token/字符数计费
- 修改类：按 token/字符数计费

### 25.8 管理端针对文案生成的管理能力

管理端新增：

- 查看租户抓取了哪些抖音链接
- 查看文案生成消耗
- 查看每次文案修改对话
- 查看哪些文案被最终定稿并进入任务系统

## 26. 推荐实施顺序补充

在原先 4 期之外，插入一个“文案生成模块”阶段：

### 第 2.5 期：文案工作台

先做：

1. 文案生成页面 UI
2. 文案会话/版本/消息表
3. MiniMax 文本生成接口
4. 多轮修改接口
5. 定稿后进入现有任务系统

这样可以先把“抖音链接 -> 新文案 -> 音频视频”的完整业务链闭合。
