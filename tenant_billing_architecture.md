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

