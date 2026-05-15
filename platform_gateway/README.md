# Platform Gateway

这个目录是“本地部署租户 + 平台统一计费”的最小可运行骨架。

## 模型

- 租户软件部署在各自本地
- 租户不直接拿 MiniMax 原始 key
- 所有 MiniMax 文本/语音调用先走平台网关
- 平台网关按真实调用量换算成平台积分，再按租户倍率扣分
- 平台只记录元数据、积分流水、调用日志，不保存租户素材文件

## 当前已实现

- 租户创建/查看
- 手工充值
- 积分流水
- 文案生成代理
- 文案会话与多轮修改

## 启动

1. 复制 `.env.example` 为 `.env`
2. 填写 MiniMax 和管理员令牌
3. 运行：

```bash
npm run dev
```

默认端口：

```text
http://127.0.0.1:3320
```

## 主要接口

### 管理端

- `POST /admin/tenants`
- `POST /admin/wallet/topup`
- `GET /admin/tenants`
- `GET /admin/ledger?tenantId=...`

### 租户端

- `GET /tenant/me?tenantId=...`
- `POST /tenant/copywriting/session`
- `POST /tenant/copywriting/generate`
- `POST /tenant/copywriting/revise`
- `GET /tenant/copywriting/session/:id`

## 关于抖音链接摘抄

这个骨架没有直接实现抖音网页抓取。

原因：

- 抖音链接抓取依赖浏览器模拟、Cookie、签名和反爬策略
- 这部分应作为单独的提取模块

建议流程：

1. 本地客户端提交抖音链接到本地提取器
2. 本地提取器拿到标题/简介/字幕
3. 只把提取后的文本发给平台网关做文案生成和计费

这样平台不保存租户视频文件，也不需要保存原始媒体。
