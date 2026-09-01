---
name: host-watchdog
layer: team
description: 黑盒探针（Gatus）结构上探不到的三层——容器进程、systemd 单元、隧道站点与磁盘，必须由主机侧巡检补齐。含 2026-09-01 实测标本：一个容器崩溃循环 18238 次、持续两个月、全链路零告警；以及「显式白名单而非全量扫描」的误报纪律。给主机或服务加健康检查、排查「为什么没人发现」前必读
---

# 主机侧巡检：黑盒探针探不到的那一层

## 触发它的标本（2026-09-01）

node1 上的 `gorse-gorse-1` 容器**以每 60 秒一次的频率崩溃循环了两个月，累计 18238 次，
没有产生任何一条告警**。

它不是监控配置错了，而是**结构上探不到**：

- Gatus 从 node3 出发探公网 HTTP 入口。这个容器**没有公网入口**，不在任何探针的视野里。
- 它也没有指标上报，vmalert 那套规则同样看不到它。
- 唯一能发现它的地方是 `docker ps` 里的 `Restarting` 状态——而没有任何东西在看。

顺带暴露的同类风险：同机的 `redis` 与 `casdoor` 的 restart policy 是 `no`，
**退出后永不拉起**，同样无人会知道。

## 黑盒探针的三个结构盲区

黑盒探针只做一件事：发请求、比状态码。由此推出它**永远**看不见的三类故障：

| 盲区 | 为什么探不到 | 真实后果 |
|---|---|---|
| 容器崩溃循环 / 退出不拉起 | 没有公网入口的组件不在探测面里；有入口的组件崩了也可能因为端口仍被监听或有缓存而返回 200 | 崩两个月无人知 |
| systemd 单元 failed | 完全在 HTTP 之外 | `docker.service` 挂了，所有容器一起没 |
| 隧道站点掉线 / 磁盘将满 | 隧道断是**根因**，下游 502 只是**症状**，且要恰好有探针覆盖那个下游才看得见；磁盘没有 HTTP 表示 | 502 满天飞却找不到源头；库文件写满后静默损坏 |

判据与 [`alerting-signal-hygiene.md`](alerting-signal-hygiene.md)「探针必须探功能有没有推进」是同一条原则的两面：
**那一条问「进程活着但不干活，探针会红吗」；这一条问「进程连活都没活，探针够得着吗」。**

## 分工：外部视角 vs 内部视角

```
Gatus          从外部走公网 DNS/TLS 探「入口通不通」      —— 外部视角
host-watchdog  在机器内部看「进程/单元/隧道/磁盘在不在」  —— 内部视角
```

两者刻意不重叠，且**互为对照**：同一个服务既有公网探测又有本机回环探测时，
可以直接区分「服务死了」和「通往服务的路断了」——这正是 Gatus 里
`*-edge` / `*-origin` 成对命名的用意。

告警出口统一收敛到既有的 ntfy 通道，**不引入新的告警系统**。

## 硬纪律：显式白名单，不做全量扫描

巡检对象必须是显式列出的白名单，**不能用「所有非 running 的容器」这类全量扫描**。

理由是实测的：node1 上躺着一批早已停用的容器（`minio`、`config-center`、
`ecommerce-gateway`、`consul`、`jaeger`、`kafka-kafka-1`、`zitadel-*`），
全量扫描会为它们产生常驻告警。而**常驻误报会训练人忽略整个通知渠道**——
这与 [`alerting-signal-hygiene.md`](alerting-signal-hygiene.md) 记录的那场
「9 小时事故无人发现」是同一个失效机制。

宁可漏掉未登记的容器，也不制造噪声：漏掉的是「不知道要看」，
制造噪声毁掉的是「所有告警的可信度」。

同理，**已知坏掉的东西不要先纳管再说**。`gorse-gorse-1` 当时就没有进白名单，
因为加进去等于立刻多一条永久红；正确顺序是先决定它的去留（后于当日删除），再决定是否纳管。

## 验收：没验证过的告警通道等于没有

安装完必须跑**两条**路径，只跑正常路径不算数：

1. **正常路径** → 退出码 0，输出 `OK`
2. **故障路径** → 注入一个不存在的容器名（或临时把磁盘阈值调到 1%），确认：
   - 脚本准确报出问题、退出码 1
   - **手机真的收到 ntfy**

第 2 步实测踩到过一个坑：ntfy 的发布 token 通常是**只写不读**的最小权限设计，
所以「回查 topic 历史」会拿到 `403 forbidden`，那**不代表推送失败**。
判定推送是否成功要看 POST 的 HTTP 状态码（200 且返回带 `"event":"message"` 的 JSON），
而不是看能不能读回来。

## 部署

脚本与一键安装在 [`infrastructure/host-watchdog/`](../../infrastructure/host-watchdog/)。
所有检查项都是**按需启用**（变量留空即跳过），因此同一份脚本可以直接用在任意主机上：

```bash
cd infrastructure/host-watchdog
./install.sh <ssh-host> --dry-run    # 先看会做什么
./install.sh <ssh-host>              # 幂等,可重复执行
```

凭据只写在目标机的 `/etc/host-watchdog/watchdog.env`（`0400`），**不入库**——见 AGENTS.md 硬规则 4。

给业务服务用时，`HTTP_CHECKS` 探本机回环的健康端点即可，形如
`HTTP_CHECKS="order=http://127.0.0.1:8080/healthz payment=http://127.0.0.1:8081/healthz"`。
它与集群外的公网探测互补：前者证明进程在干活，后者证明外面进得来。

## 已部署实例

| 主机 | 覆盖 | 备注 |
|---|---|---|
| node1 | 14 个容器 + `docker.service` + 2 个本机 HTTP 端点 + Pangolin 隧道站点 + 磁盘 | 每 5 分钟；实测 2026-09-01 |
| node2 | 11 个容器（Harbor 全家桶 + gorse + MinIO + nginx/redis）+ `docker.service`/`fail2ban.service` + 3 个本机 HTTP 端点 + 磁盘 | 每 5 分钟；实测 2026-09-02 |
| node3 | 7 个容器（gatus/ecommerce-gatus/otelcol/CDC/bugsink/healthchecks）+ `docker.service` + 4 个本机 HTTP 端点 + 磁盘 | 每 5 分钟；实测 2026-09-02 |

node3 的覆盖对象里有 `gatus`、`ecommerce-gatus` 与 `otelcol`——**探针与采集器本身**。
它们挂掉的表现是「所有告警都安静了」，与「一切正常」在信号上完全一致，
正是最需要由外部巡检盯住的一类。

### 本机探 TLS-only 端点：用 `--resolve`，不要用 `-k`

node2 的 Harbor 与 MinIO 是 TLS-only，实测出一个两难：直接探
`https://127.0.0.1:port` 因证书 CN 不匹配返回 `000`（脚本刻意不带 `-k`）→ 永久误报；
改探公网域名又会绕出去经 Pangolin → 不再是「本机」探测，探不出「入口通但服务死」。

解法是 `curl --resolve host:port:127.0.0.1`：**TLS 按域名校验，流量不出机器**，
两个目标同时满足。不加 `-k` 是有意的——跳过校验会连带放过「证书过期」这类真故障，
而本项目的证书恰恰是手工拷贝、不会自动续期的（见 `docs/SECURITY-HARDENING.md`）。

配套的期望状态码用**逗号**分隔（`200,401`）：`HTTP_CHECKS` 整体按空格分词，
写成 `200 401` 会被拆成两个 item，每轮产生两条「格式错误」误报——本次踩过。
要鉴权的端点返回 `401` 恰恰证明进程活着（node3 的 Elasticsearch 即用 `200,401`），
比强行找一个匿名 200 端点更可靠。

## 相关

- 告警信号卫生（慢性红淹没急性事故）：[`alerting-signal-hygiene.md`](alerting-signal-hygiene.md)
- 公网暴露拓扑与隧道站点语义：[`pangolin-tunnel.md`](pangolin-tunnel.md)
- 脚本兼容性边界（Bash 3.2 空数组）：[`shell-scripting.md`](shell-scripting.md)
