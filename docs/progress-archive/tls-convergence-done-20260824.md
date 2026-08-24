# 基础设施 TLS 收敛 —— 已完成项证据存档

> 2026-08-24 从 `TODO.md`「基础设施 TLS 收敛」段归档。原因：TODO.md 触到 96000B 预算上限，
> 按门禁自身的指引把证据长文按日期归档。**未完成项仍留在 TODO.md**，这里只存已完成的证据。

- [x] **修 dragonfly 网关路径：Terminate → Passthrough**（✅ 2026-08-20 随「缓存切回 dragonfly + 原生 TLS」整组解决：dragonfly 进程自身终结 TLS，网关重写为 TCP 6380 直通 listener（TCPRoute→svc:6379），Terminate 死路整组替换；见 kubernetes 仓 `components/dragonflydb/gateway/`）。~~现状 listener 是 `Terminate`，网关解密后把明文 redis 协议转给只收 TLS 的后端——这条路径是坏的~~

- [x] **CNPG 宿主网 TLSRoute（2026-08-24）**：postgres 安装器在 `pg-main-rw` 就绪后自动应用 Gateway + TLSRoute；dev VIP `192.168.3.132:5432`。宿主网以 SNI `pg.dev.test`、`verify-full`、direct TLS 实查 `ecommerce/app` 与 TLSv1.3；另留 TCPRoute 示例兼容旧客户端

- [x] **MinIO 上 TLS + 管理台收回内网（2026-08-19 完成）**：`node2` 的 ssh 别名是 **`node2`（端口 34124，阿里云，与集群内 node2 `192.168.3.202` 重名但完全无关）**，同机还跑着 harbor 与 gorse。MinIO 是 docker 容器 `pgsty/minio`，compose 在 `/home/docker/minio/compose.yml`（**服务器侧是真相源**，备份 `compose.yml.bak-20260819`）。三处改动：①挂 node1 那张 ZeroSSL 泛域名证书 `*.apikv.com` 到 `/root/.minio/certs`——**宿主机侧必须自带空 `CAs/` 目录**，整卷挂载会遮蔽容器内原有结构，且挂 `:ro` 后 MinIO 无法自建（与 helm `db-ca-cert` 遮蔽系统 CA 是同一个坑）②9001 由 `9001:9001` 改 `127.0.0.1:9001:9001`，运维走 `ssh -p 34124 -L 9001:127.0.0.1:9001 node2` ③healthcheck 由 `mc ready local`（alias 硬编码 `http://localhost:9000`，启用 TLS 后必失败）改 `curl -fsk https://localhost:9000/minio/health/live`。**实测验收**：9001 公网 http/https 均 `000`、9000 明文 http 返 `400`、`https://minio.apikv.com:9000` **不带 `-k` 的严格校验** 200（证书 3 张链完整，SAN `*.apikv.com`+`apikv.com`，ECDSA P-256）

- [x] **node2 接入 Pangolin + 全部端口收回回环（2026-08-19 完成）**：⚠️ **先记住这条硬约束**——`node2` 是阿里云机，`apikv.com` **未在阿里云备案**，任何经该域名访问本机的请求都被阿里云在网络层拦掉（HTTP 返 403 `Server: Beaver` + `<title>Non-compliance ICP Filing</title>`，HTTPS 直接 reset）。`harbor`/`img` 两个早就存在的子域同样被拦。**所以"给这台机的服务配域名+证书直连"这条路根本走不通，唯一解是让公网流量落到 node1 再经隧道回来**。做法：node2 装 newt 1.15.0（二进制 `/home/docker/newt/newt` + systemd `newt.service`，`systemctl link` 自 `/home/docker/newt/`，凭据在同目录 `newt.env` 权限 600，不入库），建站点 **siteId 5 `node2`**；建资源 `minio.apikv.com`(rid 16, SSO off, target `127.0.0.1:9000` https) 与 `gorse.apikv.com`(rid 17, **SSO on**, target `127.0.0.1:8088` http)。随后 minio 9000/9001、gorse 8086/8088 **全部改绑 `127.0.0.1`**。**实测**：四个端口公网均 `000`，`https://minio.apikv.com` 严格校验 200，`https://gorse.apikv.com` 302（被 SSO 挡住）

- [x] **gorse 恢复 + 自带鉴权（2026-08-19 完成）**：故障链是「**Redis 被停 → gorse 启动时 fatal**」：`node1:6379` 的 redis 容器 2026-08-18 15:40 被主动停掉（SIGTERM、退出码 0、正常存盘 36 keys，重启策略 `no` 不自愈），而此前 gorse 是 6 月启动的老实例，带着断掉的连接空转（`Ready:false`）才显得"还活着"——**一重启就再也过不了启动检查**，这类隐性故障只有在重启时才暴露。恢复后还差一步：redis/pg 起来了但 **node2 仍连不上 6379**，根因是**腾讯云 Lighthouse 防火墙没放行 6379**（5432 早就是 `0.0.0.0/0` 所以 PG 一直通）。已加规则但**锁定源 IP 为 `<node2-source-cidr>`**（Redis 密码是 `***REMOVED-PASSWORD***` 弱口令，绝不能对全网开），实测本机连 6379 超时、node2 连通、对照组 443 两边都通。gorse 侧同时配好自己的鉴权（`config.toml` 备份 `config.toml.bak-20260819`）：`[server] api_key`、`admin_api_key`、`[master] dashboard_user_name/password` 原本**全是空串**。**实测验收**：`Ready:true`（两个 store 都连上）；经 `https://gorse.apikv.com` 无 key/错 key 均 **401**、正确 key 404（鉴权已过）、Dashboard 未登录 302→`/login`、`verify=0`；IP 直连 8088 仍 `000`。SSO 已关（改由 gorse 自身鉴权），三份业务配置已切到 `https://gorse.apikv.com`

- [x] **彻底登出 + 修掉登录入口的两套机制混用（2026-08-19，本地实测通过）**：改动三处——①`logout()` 末尾跳 Casdoor 的 `end_session_endpoint`（`/api/logout`）②**必须带 `id_token_hint`**，缺了它 Casdoor 返回 `{"status":"error","msg":"Missing parameter: id_token_hint"}` 且**不结束会话**，页面还停在那段 JSON 上；为此把 `id_token` 一路接进 `TokenResult`→`setTokens`→`tokenStore`（同样只存内存），登出时**先取后清** ③`AppBar` 的登录按钮由 `window.location.href = getSigninUrl()`（casdoor-js-sdk 老路径，state 写进 `casdoor-state`、**不生成 code_verifier**）改为 `useAuthActions().login()`（PKCE）。**②③ 是两个独立的既有 bug，不是本次引入**：入口走 SDK、回调走 `exchangeCode()` 读 `oauth_state`/`oauth_code_verifier`，必然报「OAuth state 校验失败」——**线上同样是坏的**，只是开了「自动登录」的用户靠 `silentRenew` 直接静默登入，走不到那个按钮所以没暴露。**实测判据**（生产构建 + 全新浏览器）：登录成功 → 登出后自动跳回应用且未登录 → 刷新仍未登录 → **再点登录时 Casdoor 要求重新输密码**（最后这条才是「会话真的结束」的证据，前两条只能证明本地清理生效）

- [x] **node1 的 Redis 上 TLS + 强随机密码（2026-08-19 完成）**：`/home/docker/redis/conf/redis.conf` 改为 **`port 0` + `tls-port 6379`**（明文端口彻底关闭），证书复用本机那张 ZeroSSL `*.apikv.com`（`/home/docker/redis/tls/`，**属主必须是 uid 999**，redis 官方镜像以该用户运行，否则读不到私钥启动即失败）；`tls-auth-clients no` 时 Redis 仍强制要求 `tls-ca-cert-file`，用 fullchain 自身充数即可。密码换成 40 位随机（原 `***REMOVED-PASSWORD***`）。客户端必须 **`rediss://` + 连 `redis.apikv.com`**——证书无 IP SAN，连 `node1` 校验必失败。gorse 的 `GORSE_CACHE_STORE` 已切换，实测 `Ready:true` / `CacheStoreConnected:true` / `DBSIZE` 回升。**实测验收**：公网 TLS 握手 + 系统 CA 严格校验通过（TLSv1.2，SAN `*.apikv.com`）、明文连接收到 TLS Alert `\x15\x03\x03`、未认证 `PING` 返回 `NOAUTH`、错误密码 `WRONGPASS`

- [x] **公网 docker 端口随机化（2026-08-19 完成）**：全部改到 **>32767**（避开 k8s NodePort 的 30000-32767 段）。node1：redis `6379 → 61246`、postgres `5432 → 52288`（Lighthouse 防火墙同步迁移，**先加新规则再删旧规则**）；node2：harbor `5080 → 41311`、`5443 → 49600`（`harbor.yml` 与 `docker-compose.yml` **两处都要改**，前者供下次 `prepare` 用，否则会被覆盖回去）。gorse 的两个连接串已同步。**实测**：旧端口全 `000`、新端口可达、gorse `Ready:true`

- [x] **harbor 修复：换掉过期证书 + 经 Pangolin 暴露（2026-08-19 完成）**：浏览器报红有**两个叠加原因**，只修一个不够——①**证书早已过期**：harbor 用的是 `Apr 22 → Jul 21 2026` 那张（6 月放进去的），而 node1 上有效的是 `Jul 29 → Oct 27`；②**即使换新证书也还是红**：`*.apikv.com` 证书配 IP 访问必然域名不匹配，而域名访问又被阿里云 ICP 拦截。所以真正的解法是走 Pangolin：资源 `harbor.apikv.com`(rid 18, SSO off——docker login 过不了 SSO, target `127.0.0.1:49600` **https**；41311 是 http 会 308 跳转，用它会把浏览器导回被拦的地址)，并删掉 `harbor` 的 DNS A 记录让它回落泛解析到 node1。**证书要放两处**：`harbor.yml` 指定的 `ssl/`（原本是空目录，`prepare` 会从这里取）和 `data/secret/cert/`（实际生效的副本）。**实测**：`https://harbor.apikv.com` 严格证书校验通过、HTTP 200、`/v2/` 返回 401（registry API 正常）。仓库里 6 处 `harbor.apikv.com:5443` 引用已同步改为不带端口

- [x] **修掉 node1 Redis 无持久化卷的隐患（2026-08-19）**：compose 原本只挂 `./conf`，**RDB 落在容器可写层**，`docker compose up --force-recreate` 一重建就丢——2026-08-19 已因此丢过一次 gorse 的 36 个缓存 key（可重建，无实质损失，重启后已回升到 28）。已加 `data:/data` 具名卷


## 同日删除的过期待办（不再适用）

以下三条在 2026-08-24 的环境对齐中确认已失去前提：Elasticsearch 与 Kafka 均已退役、
零残留；`frontend.yml` 里用到 `HELM_REGISTRY_PASS` 的两个构建 job 已整体删除。

- [ ] **`HELM_REGISTRY_PASS` secret 缺失**：`.github/workflows/frontend.yml` 的 chart 推送用 `helm registry login harbor.apikv.com -u rebot@github`，但仓库里只有 `MANIFEST_PUSH_TOKEN`/`TCR_*`/`CASDOOR_E2E_*`，没有这个。要在 harbor 里建机器人账号 `rebot@github` 并把 token 配成 secret，否则打 tag 后 chart 推送步骤必失败

- [ ] **Elasticsearch 恢复 HTTP 层 TLS**：ECK 的 `spec.http.tls.selfSignedCertificate.disabled=true`，是被主动关掉的；打开后 search 服务的客户端配置需同步（CA 或 skip_verify）

- [ ] **Kafka 启用 9093 TLS listener**：Strimzi 已定义 `tls:9093`（`tls=true`，Strimzi 自签 CA）但无人使用，现用 `plain:9092`。Kafka 客户端代码为 0，**接 Kafka 时直接从 9093 起步**，别先接明文再改。两个 listener 都是 `internal` 型、无外部入口；将来若需外部访问，走 TLSRoute Passthrough 而非新开 LB

