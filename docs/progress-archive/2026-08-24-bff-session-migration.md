# 鉴权改造：Web 与桌面端切服务端会话（2026-08-24）

`TODO.md` 只留状态与待办，验收证据放这里（不可变历史，非并行真相源）。
决策与手顺的真相源在同级仓 **control-tower**：`docs/design/adr-0002-bff-session.md`（取代 ADR-0001）
与 `docs/design/bff-migration.md`。

## 背景：为什么翻案

原方案（ADR-0001）是 bearer JWT + 撤销名单。翻案理由两条，都不是「触发条件满足了」：

1. **ADR-0001 有一处事实错误**：它认为跨源 cookie 会撞三方 cookie 淘汰。实际 prod 的
   `shop` / `gateway` / `casdoor` 三个域同属 `apikv.com`，属 **same-site**，
   `Domain=.apikv.com; SameSite=Lax` 即可。这个错误当初压低了 cookie 方案的评分。
2. **会话存储依赖已被接受**（Dragonfly 集群里现成在跑），而「重新引入热路径状态」
   正是 ADR-0001 拒绝该方案的主因。

外加服务端会话独有的三项能力：会话清单、即时撤权、封禁不再依赖跨系统两步。

## P2：Web 端（本仓改动）

- 新增 `packages/configs/src/auth/bff.ts`：`/auth/me`、`startBffLogin`、`bffLogout`
- `packages/api` transport 全量 `credentials:"include"`
- consumer vite 加 `/auth` 与 `/api` 同源代理
- `src/env.ts` 放开 `VITE_GATEWAY_URL` 接受同源前缀

**为什么 dev 必须同源**：会话 cookie 是 `SameSite=Lax`，`localhost:3000` → 网关 LB 属跨站，
浏览器根本不发 cookie。生产无此问题（三域同属 `apikv.com`）。

## P3：桌面端（本仓改动）

- 新增 `packages/utils/src/sessionStore.ts`：会话 id 只存内存，经 `X-CT-Session` 发出
- `authInterceptor` 三态：会话头 → bearer（legacy）→ 匿名
- `bff.ts` 加 `buildNativeLoginUrl`

**关键设计**：网关 `mode=native` 把 session id 经**回环回调**交回原生层，
回调参数沿用 `code`/`state`——Tauri 的 Rust 拦截器就认这两个 key，
因此桌面端切换**不需要改 Rust、不需要重建原生层**。

**意外收获**：桌面端切会话轨后，两端的冷启动、401 处理、登出**合并为同一实现**，
`AuthProvider` 净减约 120 行，PKCE 在两端都退场。

## 实测证据（dev 集群 + 真浏览器）

| 项 | 结果 |
|---|---|
| 登录闭环 | `/auth/login` → Casdoor（机密客户端换 code）→ 建会话 → cookie → 跳回，一次通过 |
| 会话落库 | Dragonfly `EXISTS sess:*`=1、TTL≈43200s、`SMEMBERS user:<sub>` 命中（二级索引=会话清单底座） |
| 身份与角色 | `/auth/me` 返回 name/owner/roles；roles 在登录时取一次存入会话，热路径不回源 |
| 带权 RPC | 经 `/api` 同源代理 200，真后端返回 |
| CSRF | 同 cookie + 恶意 Origin → **403 CSRF_ORIGIN_REJECTED** |
| 桌面端 header 轨 | 无 Origin → 200 |
| **即时撤权** | 删会话后**下一个请求**即 `SESSION_INVALID`，间隔 40ms 且全为建连开销——零传播延迟 |
| 登出 | 204 + `Max-Age=0` 清 cookie + 会话删除 + 后续 401 |
| UI 撤权演练 | 删会话 → 进购物车触发 401 → 跳登录 → Casdoor 会话仍在 → 静默换发新会话 → 回到原页面 |

## 途中修掉的三个真问题

1. **`env.ts` 的 `z.url()`** 让 `VITE_GATEWAY_URL=/api` 直接崩在启动——页面全白，
   控制台只有一行 `Invalid environment variables`。
2. **路由守卫断裂**（类型检查发现不了）：`profile` 与 `profile/addresses` 的 `beforeLoad`
   原按「内存里有没有令牌」判断，BFF 下令牌恒为 null，**已登录用户会被误踢去登录页**。
   改为以 `/auth/me` 为准。这是「grep 看不到的间接引用点」的实例。
3. **Dragonfly 以 `--tls` 启动**，明文连不上；证书 SAN 含 `dragonfly.dragonfly.svc`，
   故走正常 CA 校验即可（不需要 InsecureSkipVerify）。

## 遗留

- 桌面端**未做真机验证**（无 Tauri 构建环境）；网关侧 native 模式有测试覆盖。
- 真机通过后即可删 `pkce.ts`、`tokenStore.ts` 与 `/callback` 路由（现已无人使用）。
- 会话 id 仅存内存，桌面端重启需重新登录；要免登录应存 OS keychain，**不要**存 localStorage。
- pre/prod 上线前：去掉 `SESSION_COOKIE_INSECURE`，设 `Domain=.apikv.com`。
