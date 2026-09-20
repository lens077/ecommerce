# 网站分析（Umami）

自托管 Umami，采站点级访问指标给运营看：PV/UV、来源、停留、设备、地域。
无 cookie、不采 PII，因此不需要 Cookie 同意横幅。

| 项 | 值 |
| --- | --- |
| 面板 | `https://umami.apikv.com` |
| 集群内 | `http://umami.ops.svc.cluster.local:3000` |
| k8s 清单 | **kubernetes 仓** `components/umami/`（第三方组件归集群仓） |
| 数据库 | 集群外 node3 Pigsty `10.10.21.172:5432/umami` |
| 部署入口 | `scripts/deploy-umami.sh` |
| tracker | `https://umami.apikv.com/s.js` |

## 和 `@ecommerce/tracker` 的分工

两条链路都叫「埋点」，但目的和去向完全不同，**不要互相替代**：

| | `@ecommerce/tracker` | Umami |
| --- | --- | --- |
| 采什么 | 商品浏览/点击行为 | 站点级访问指标 |
| 去哪 | behavior 服务 → gorse | Umami 自己的 PG |
| 给谁用 | 推荐算法 | 运营看板 |
| 少了会怎样 | 推荐变差 | 看不到流量构成 |

所以两者在前端是并存的，`analytics.ts` / `umami.tsx` 只管后者。

## 前端接线

两个面向消费者的应用都已接入，各自读一对构建期变量：

| 应用 | 文件 | 变量 |
| --- | --- | --- |
| `apps/consumer`（Vite，chart `frontend`） | `src/analytics.ts` | `VITE_UMAMI_SCRIPT_URL` / `VITE_UMAMI_WEBSITE_ID` |
| `apps/consumer-next`（Next.js） | `src/analytics/umami.tsx` | `NEXT_PUBLIC_UMAMI_SCRIPT_URL` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` |

设计上的三个约束：

- **两个变量缺任一就完全不加载。** 本地开发和未配置的环境不会往面板灌垃圾数据，
  也不必为此改 HTML 或加 if-else。
- **构建期内联。** 改值必须重新构建镜像；改 Deployment 的 `env` 不生效——
  Vite 的 `import.meta.env` 和 Next 的 `NEXT_PUBLIC_*` 都在打包时替换成字面量。
- **桌面端（Tauri）不注入。** 它跑在 `tauri://` 下，Umami 按域名归集数据，
  打点会落到一个无意义的来源上，所以 `apps/consumer` 里用 `isTauri()` 挡掉。

`apps/consumer` 的两个变量进了 `src/env.ts` 的 t3-env 校验（`z.url()` / `z.uuid()`），
填错格式在构建期就报错，不会等到线上发现没数据。

## 拿 websiteId

```bash
UMAMI_ACTION=website scripts/deploy-umami.sh
```

脚本会登录面板、确保 `shop.apikv.com` 站点存在（已存在则复用，不重复建——
重复建会产生第二个 websiteId，前端埋错就白采），然后打印 websiteId 和两套变量的原文。

## 部署与体检

```bash
scripts/deploy-umami.sh                      # 部署 + 验证 + 打印 websiteId
UMAMI_ACTION=verify scripts/deploy-umami.sh  # 只体检，不改集群
```

`verify` 检查五项：Pod 就绪与重启次数、`/api/heartbeat` 200、tracker 脚本可取、
以及数据库侧的表数/站点数/事件数。

组件本身的安装、凭据 seed、升级与卸载见 kubernetes 仓 `components/umami/README.md`。

## 几个容易误判的点

**数据库走内网直连，不经 Pangolin。** Pod 直连 `10.10.21.172:5432` 实测可达。
这与 10 个业务服务经 node1 Pangolin `30001` 的路径不同，排查时别照那套查。

**node3 是一台机器两个身份。** `10.10.21.163` 是它的 k8s worker 节点 IP，
`10.10.21.172` 是它的 Pigsty 数据面 IP（2026-09-17 实测：同一 hostname 下 kubelet active
且 PG 在监听）。所以「库在集群外」只是进程边界，不是机器边界。该机内存长期 80%+。

**tracker 文件名是 `s.js` 而非默认的 `script.js`。** 改名为绕开按文件名匹配的广告拦截规则。
但默认路径**并未关闭**——两个都返回 200，所以这只是提供一条不被规则命中的备用路径。
前端必须显式用 `/s.js`。

**组件没有 PVC。** 全部状态在 node3 的 PG 里，删掉重装不丢数据；反过来说，
要清数据得去那个库 `DROP DATABASE`。
