# 零信任鉴权与统一 Session · 待办

> 对应 [`docs/TECH.md`](../TECH.md) §8「零信任鉴权与统一 Session 架构」。
> **本文件不是并行真相源**——状态与优先级以 [`TODO.md`](../../TODO.md) 为准。

## 目标态（TECH.md §8 摘要）

**完全废弃 JWT**，采用 Casdoor（IAM 相位点）+ Dragonfly 持久化 Session Store +
OpenFGA 关系授权的零信任体系。

```text
客户端 ──(Session Token)──► control-tower ──(验证)──► Dragonfly Session Store
                                │
                                ├──( Check API )──► OpenFGA（鉴权真相源）
                                └──(透传 X-User-ID / X-Merchant-ID)──► 后端服务
```

**红线（TECH.md §13）**：严格遵循 Casdoor 有状态 Session 模型，
**绝不允许同时维护 JWT 兼容逻辑或双重鉴权代码路径**。

## 当前事实（2026-08-29 实测）

- BFF session 已上线：Web 用 httpOnly cookie、Tauri 用 session header，`/auth/me` 为登录态真相源
- 浏览器侧令牌机制已全部退场（`pkce.ts`/`tokenStore.ts`/`session.ts` 等已删）
- **存量 legacy bearer JWT 轨与撤销名单仍在网关**——与红线冲突，见下
- 授权仍是 Casbin RPC 粒度；**OpenFGA 已部署（2/2 Running）但业务未接线**
- 15 个 Deployment 全部 `automountServiceAccountToken: false` + 独立 SA（无一使用 default）✅

---

## P0

- [ ] **轮换 public 仓 git 历史泄露的全部凭据（2026-09-02 发现）**：`github.com/lens077/ecommerce`
      是 public，历史 30 个提交含 PG root 口令 `msd…`（6 位弱口令）（node1 `:52288`，已于 09-01 轮换——但
      Casdoor 库同实例，确认新口令未复用）、Casdoor `client_secret` ×3（`baab…`/`5da8…`/`329d…`）、
      两个随机口令（`XwjL…`/`oGub…`，对应服务待用户确认）、payment 的支付 RSA `private_key`
      与 `secret`、Consul TLS EC 私钥（KV 快照内）、Debezium `debezium_user` 口令。历史已用
      filter-repo 三轮重写并强推两远端（证据见 evolution-log 2026-09-02），**但 GitHub 悬空对象
      经 SHA 仍可读，必须按已泄露处理**：全部轮换（**2026-09-02 用户确认已完成**）+ 向 GitHub Support 申请清理（未做）
      （https://support.github.com/request → Remove sensitive data）。门禁已补
      （`.gitleaks.toml` + pre-commit + 两远端 CI），防再犯不防已泄。

- [ ] **网关部署补 `redis-tls-ca` Secret**：部署已挂载但标了 `optional: true`
      （缺了只退化成仅进程内缓存，不会让网关起不来）。
      **2026-08-29 全集群实测确认该 Secret 确实不存在**（含 `redis` 字样的 Secret 只有 `argocd/argocd-redis`）。
      落点在 control-tower 网关清单上复核（旧 `gateway/deploy` 已随目录删除）。
      取值：`kubectl -n redis get secret redis-tls -o jsonpath='{.data.ca\.crt}' | base64 -d`
      后在网关所在 namespace 建同名 Secret。

- [ ] **移除 legacy bearer JWT 轨**（与 TECH.md §13 红线直接冲突）：
      网关 legacy bearer 轨与撤销名单**暂留**，是最不可逆的一段，建议烘烤数日确认无 `JWT_*` 错误后再拆。
      ⚠️ 这条**必须有退役期限**——红线禁止双鉴权路径长期并存。

- [ ] **安全 · 轮换 Config Center 预览中暴露的搜索凭据**：2026-08-28 一次跨行正则预览越过目标段，
      既有凭据进入会话工具日志；临时文件已删、仓库未落值，但**日志不可撤回，应按已暴露处理**。
      管理窗口内同步轮换 Elasticsearch 与 Config Center，滚动受影响消费者并验收旧凭据失效。
      固定手顺见
      [`config-preview-allowlist.md`](../../context/project/ecommerce/config/experience/config-preview-allowlist.md)。
      〔2026-08-31 复审对齐：本条即全局 P0 #17，原误放 P1 段〕

> **地址服务全线越权**与鉴权域相关，但登记与计数归
> [`微服务与交易闭环.md`](微服务与交易闭环.md)（全局 P0 #5）——此处只留指引不设复选框，
> 双处登记会让「各分类复选框实数」的全局计数虚增（2026-08-31 复审去重）。

## P1

- [ ] **对象级授权落 OpenFGA**：按 TECH.md §8 的关系模型（`user`/`merchant`/`store`/`order`）实现；
      粗粒度角色归 Casdoor，对象级授权归 OpenFGA，**存量 Casbin 仅迁移期维持**。
      OpenFGA 已在集群运行（2/2），缺的是业务接线。

- [ ] **RBAC 三角色细粒度校验**：order/payment/merchant/inventory 已按 **RPC 粒度**授权
      （避免整段 `/svc.v1.*` 放行导致的越权），**其余服务仍是整段放行待细化**。

- [ ] **BFF cookie 的 pre/prod 安全属性**：去掉 `SESSION_COOKIE_INSECURE` 并设 `Domain=.apikv.com`。

- [ ] **清理 5 服务 auth 配置块；东西向服务身份**（2026-08-26 宪法裁决 P1）：
      按 TECH.md B 表，东西向身份**暂不引入 SPIFFE/SPIRE**，先做低成本高确定性动作——
      CiliumNetworkPolicy default-deny 补全、每服务独立 SA + 最小 RBAC（**已完成**）、
      关闭无用 token automount（**已完成**）、审计 projected SA token 与「只信任网关头」边界。

- [ ] **Casdoor 密码策略只有 `AtLeast6`**，且无 IP 限制；正式上线前收紧。

- [ ] **`/api/get-application` 匿名可读**（返回值已脱敏，`clientSecret`/`tokenFormat` 为 `***`），
      仍会泄露应用存在性与部分配置形态。评估是否在 Pangolin 侧限制。

- [ ] **Casdoor 集成收尾**：第三方登录、账号治理和 OpenFGA 对象权限仍待端到端验收。

- [ ] **给 Config Center 灌 gorse 的 `api_key`**：`behavior/{dev,pre}.yml` 与 `product/pre.yml`
      的 `api_key` 按硬规则 4 保持空串，但 gorse 侧鉴权已开——**不填真值业务调用会全部 401**。
      真值在 node2 的 `/home/docker/gorse/config.toml`。

## P2

- [ ] **传输层 mTLS 分阶段**（TECH.md B 表定稿）：优先级 ①**Cilium WireGuard 节点间透明加密**
      （零应用改造，非 workload 级）——首选，小范围实测后再全集群启用；
      ②真需要 workload mTLS + 授权时首选评估 **Istio Ambient**；
      ③**Cilium Mutual Authentication 1.20.1 仍 Beta 且官方自述安全模型不完整，不得当作 workload mTLS**；
      ④Linkerd OSS 自 2024 起不再发 semver stable 工件，不选。

- [ ] **Tetragon enforcement 门禁**：当前唯一策略 `ecommerce-service-account-token-access`
      为 namespaced **audit-only，不阻断**。enforcement 待独立评估。
      剩余权限治理、长期基线、事件完整性见
      [`2026-08-28-tetragon-follow-ups.md`](../reports/2026-08-28-tetragon-follow-ups.md)。

- [ ] **`restoreSession` 与 callback 的竞态**：`AuthProvider` 原用
      `router.state.location.pathname` 判断是否跳过 `restoreSession()`，
      但那要等 TanStack Router 初始化完，effect 首跑时可能还是 `/`，防护形同虚设。
      已改用 `window.location.pathname`（不依赖框架初始化）。
      **Casdoor 开「保持登录会话」后 `silentRenew` 更易成功，该竞态被放大**。
      改动已验证不影响登录，但**没有回归测试守着**。

- [ ] **`e2e/login.smoke.mjs` 缺少隐私弹窗处理**：首页的 Privacy policy 模态会盖住顶栏，
      **点不到 SIGN IN**，脚本会在第一步就超时。本地实测必须先点 `Reject all`/`Accept all`。
      这条 e2e 至今没在 CI 里真跑过。
