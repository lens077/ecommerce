# 边缘主机加固：SSH 暴力破解与公网暴露面

> 范围是**本仓 K8s 集群之外的两台边缘主机** node1（node1）与 node2（node2）。
> 集群内的零信任、CNP、Tetragon 见 [2026-08-28 零信任与运行时安全验证](reports/2026-08-28-zero-trust-runtime-security.md)，两者不重叠：
> 那份管 Pod 与 East-West，这份管**宿主机与 North-South 的公网入口**。
>
> node1 与 node2 不是 K8s 节点（K8s 是 node101/102/103 = 192.168.3.101-103），
> 但它们承载 `.service-matrix.yaml` 里 10 个业务服务依赖的外部端点，见下表。

## 为什么这两台机器算 ecommerce 的攻击面

查 [.service-matrix.yaml](../.service-matrix.yaml)，两台机器承载的是业务服务的**真实依赖**，不是无关的私有服务：

| 端点 | 机器 | `used_by` | 说明 |
|---|---|---|---|
| `postgres` 30001 / `kafka` 30004 | node1（TCP 入口，隧道回 node3） | 10 个业务服务 | 主库经此入口 |
| `redis_gorse` 61246 | node1 | gorse | gorse 的 cache store |
| `postgres_gorse` 52288 | node1 | gorse **+ Casdoor** | 同实例两个库；Casdoor 是 SSO，详见下节 |
| `minio` | node2 | cart | 商品缩略图 |
| `gorse` | node2 | behavior、product | 推荐引擎 |
| Harbor | node2 | 全部镜像拉取 | 镜像仓库 |

因此这两台被打穿的后果直达 ecommerce：**Harbor 被攻破等于可以往镜像投毒**，而
GitOps 当前是断的（集群由 `backend/services/*/deploy/` 手工路径驱动），投毒镜像的
发现会更慢。

## 实测攻击量（实测 2026-09-01）

`journalctl -u ssh.service` 全量统计：

| 指标 | node1 | node2 |
|---|---|---|
| Failed password | 34,919 | 22,822 |
| Invalid user | 622 | 15,251 |
| preauth 断连 | 36,055 | 45,327 |
| 独立攻击源 IP | 842 | 882 |
| IPv6 攻击 | 0 | 0 |

合计约 5.7 万次密码爆破、1,700+ 独立源 IP。被爆破的用户名 Top：
`ubuntu` `admin` `user` `test` `deploy` `postgres` `oracle` `git` `hadoop` `es`
——扫描器在探测数据库与大数据服务，不是无差别撞库。

复查命令（不变量是「攻击集中在 22 端口、v6 为零」，数字随时间变）：

```bash
journalctl -u ssh.service --no-pager | grep -c "Failed password"
journalctl -u ssh.service --no-pager | grep -oE "from ([0-9]{1,3}\.){3}[0-9]{1,3}" \
  | awk '{print $2}' | sort | uniq -c | sort -rn | head -15
```

## 关键结论：攻击已停，但原因不是 fail2ban

两台机器最后一条攻击记录与 `sshd_config` 修改时间（实测 2026-09-01）：

| 机器 | 最后攻击 | sshd_config 改动 |
|---|---|---|
| node1 | `Aug 17 19:03:53` | `2026-08-17 18:50` |
| node2 | `Aug 17 19:13:13` | `2026-08-17 19:13` |

**攻击在改端口的那一分钟停止**，之后零攻击。22 关闭、迁到 34123/34124 后扫描器直接丢失目标。
两台同时已是 `passwordauthentication no` + `pubkeyauthentication yes`，那 5.7 万次爆破
**一次都不可能成功**。

由此得到一条**必须写进文档、否则会被误判的运维事实**：

> ⚠️ `sshd` jail 的 ban 计数长期为 0 在这两台机器上是**正常**的，不是「filter 没匹配上」。
> 通用排查经验里「ban 数长期为 0 通常意味着 filter 写错」在这里恰好不成立——
> 因为 SSH 攻击流量已经被端口迁移消灭了。判断 filter 是否有效要用 `fail2ban-regex`
> 跑历史日志（见下），不要用 ban 计数。

**根治是禁密码登录，fail2ban 在这里只是降噪与保险。**

## 已落地的配置（实测 2026-09-01 两台均 active/enabled）

fail2ban 版本：node1 `1.0.2`（Ubuntu 24.04）、node2 `1.1.0`（Ubuntu 26.04）。

### `/etc/fail2ban/jail.d/00-defaults.local`（两台相同）

```ini
[DEFAULT]
backend            = systemd
banaction          = nftables-multiport
banaction_allports = nftables-allports
allowipv6          = yes

ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 \
           <operator-egress-cidr> node1 node2 node3

bantime           = 1h
findtime          = 10m
maxretry          = 5
bantime.increment = true
bantime.factor    = 2
bantime.maxtime   = 5w
bantime.rndtime   = 10m

dbpurgeage = 10d
loglevel   = INFO
```

三个关键选择：

- **`banaction` 用 nftables 而非默认 iptables**：默认每封一个 IP 加一条规则，
  封到几千条后内核逐条线性匹配。两台都已加载 `nf_tables` 且 `nft` 存在，装前已确认。
- **`ignoreip` 含 `<operator-egress-cidr>`**：运维动态家宽段（从 node2 成功登录记录提取）。
  三台 node 互相加白，因为 node3 经 node1 的 Pangolin 隧道通信。
  `172.16.0.0/12` 是 Docker 网桥段，防止误封容器互访。
- **`dbpurgeage = 10d` > 默认 1d**：递增封禁依赖持久化计数，默认值会把长期封禁记录清掉。

### `/etc/fail2ban/jail.d/10-sshd.local`（两台相同）

```ini
[sshd]
enabled      = true
mode         = aggressive
journalmatch = _SYSTEMD_UNIT=ssh.service
maxretry     = 3
bantime      = 1h
```

**`journalmatch` 故意不写 `_COMM=sshd`**：OpenSSH 9.8+ 把会话进程拆成
`sshd-session`，node2（Ubuntu 26.04）实测日志里进程名就是 `sshd-session[...]`。
加上 `_COMM=sshd` 会漏掉**全部**密码失败行，且不报错——典型的「装了但没生效」。

## 验证记录（实测 2026-09-01）

### 过滤器：拿历史攻击日志跑，0 missed

```bash
journalctl -u ssh.service --no-pager -o short \
  | grep -E "Failed password|Invalid user|Connection closed by authenticating" > /tmp/f2btest.log
fail2ban-regex /tmp/f2btest.log /etc/fail2ban/filter.d/sshd.conf
```

| 机器 | 样本行 | matched | **missed** |
|---|---|---|---|
| node1 | 246,525 | 127,346 | **0** |
| node2 | 41,043 | 38,073 | **0** |

`missed = 0` 证明 filter 覆盖了含 `sshd-session` 在内的全部历史攻击格式。

> `fail2ban-regex "systemd-journal[_SYSTEMD_UNIT=...]" sshd` 这种写法在 **1.1.0 上会抛
> `TypeError: Filter.__init__() got an unexpected keyword argument '_SYSTEMD_UNIT'`**，
> 是 CLI 参数解析的版本差异，不是配置错。改用「导出文本再喂文件」的方式两个版本都可用。

### 封禁链路：v4 + v6 都真的进了 nftables

```bash
fail2ban-client set sshd banip 203.0.113.99
fail2ban-client set sshd banip 2001:db8::dead
nft list table inet f2b-table | grep -E "elements|set "
fail2ban-client set sshd unbanip 203.0.113.99
fail2ban-client set sshd unbanip 2001:db8::dead
```

两台均观察到 `addr-set-sshd` 与 `addr6-set-sshd` 各自收到条目，解封后为空。
**这一步不能跳**：banaction 因缺内核模块静默失败时，`status` 里 banned 数照涨、实际一个都没封。

### 白名单：管理出口不会被自动封

```bash
python3 -c "
import ipaddress
net=ipaddress.ip_network('<operator-egress-cidr>')
for ip in ['<operator-egress-ip-a>','<operator-egress-ip-b>','203.0.113.99']:
    print(ip, ipaddress.ip_address(ip) in net)"
```

管理段内 IP 全部 `True`，测试用攻击 IP `False`。

> ⚠️ **`ignoreip` 只过滤「日志检测出来的」失败，不拦手工 `banip`。**
> 本次验证时手工 `fail2ban-client set sshd banip <自己的 IP>` **确实成功封禁了自己**
> （已立即解封，nft set 已清空）。自动路径安全，但手工封禁时务必先确认 IP。

## 有意**不**部署的 jail —— 反向代理会导致全站自伤

上一轮计划里的 Vaultwarden / Casdoor / Harbor jail **经实测后放弃**，理由是实测证据推翻了假设：

| 计划 jail | 实测发现（2026-09-01） | 结论 |
|---|---|---|
| `vaultwarden` | 全量日志中 `Username or password is incorrect` **0 条** | 它在 Pangolin SSO 之后，爆破打不到自己的登录表单，jail 封不到任何东西 |
| `harbor-auth`（core.log） | 55 条认证失败中**只有 2 条带 `client IP`**，其余 53 条是不含 IP 的 `UserLogin` 形式 | 可封率 ~4%，收益极低 |
| `harbor`（proxy.log） | 401/403 共 276 条，但源 IP 全是 **`172.18.0.1`**（Docker 网桥网关） | **绝对不能封**——会把反向代理自己封掉，Harbor 整体下线 |
| Traefik 通用 jail | Traefik 未配置 `accessLog`，`logs/` 目录为空 | 无日志可读，需先开 accessLog 才谈得上 |

这正是「反向代理后面拿不到真实 IP 就会自伤」的具体实例：**在 node2 上按 proxy.log 配
jail，等于给自己写了一条 Harbor 下线开关。**

要让这些 jail 有意义，前置条件是先把真实 IP 透传打通（Traefik 开 `accessLog` +
Harbor nginx 配 `set_real_ip_from` / `real_ip_header`），**并且验证日志里不再是 `172.18.x.x`**，
然后才谈 filter。在那之前部署 = 制造事故。

## 仍未关闭的高危项（fail2ban 解决不了）

这些优先级**高于**本次做的 SSH 加固，因为 SSH 已经因端口迁移 + 禁密码而实际安全，
而下面两项是真的对全网敞开：

### P0：node1 `postgres_gorse` 52288 —— 明文 + 弱口令 + 0.0.0.0/0

`.service-matrix.yaml` 自己标了 ⚠️：「仍是明文 + 弱口令 + 0.0.0.0/0，待上 TLS 与轮换」。
实测 `0.0.0.0:52288->5432/tcp` 全网可达，而扫描器**正在爆破 `postgres` 用户名**（node2 上 151 次）。

端口从 5432 随机化到 52288 只是隐藏，全端口扫描一遍就出来。**fail2ban 保护不了它**：
等日志里看到爆破，弱口令可能已经被撞开。处置顺序：轮换凭据（真值只进 Config Center，
按硬规则 4 不入仓）→ 白名单收窄来源 → 上 TLS。

#### ⚠️ 这台 PG 不只服务 gorse —— 收窄前必读（实测 2026-09-01）

`.service-matrix.yaml` 原先记 `used_by: [gorse]`，**不完整**，已订正。实测当时 5 条连接：

```
postgres: root gorse   node2(...)   ← gorse，来自 node2
postgres: root casdoor node1(...) ← Casdoor ×4
```

同一实例上有 `gorse` 与 `casdoor` 两个库。**4/5 的连接是 Casdoor**，而 Casdoor 是
`docs/TECH.md` 选型表里的 IAM，挂掉等于 SSO 全断。

两个后果：

1. **收窄曾经不能只放 node2——该限制已于 2026-09-01 解除。** Casdoor 原配置是
   `host=apikv.com ... port=52288 sslmode=disable`：它和 PG 同在 node1，却**绕公网**
   解析回来（`apikv.com` 在容器内解析为 `node1`），源地址呈现为 node1 自己的
   公网 IP，按「只放 node2」写规则会立刻断掉 SSO。**已改为 `host=172.18.0.1`**（见下节）。
2. **轮换口令的影响面是两个库。** 弱口令属 `root` 用户，gorse 与 casdoor 共用，
   不是「只动 gorse」。这条**仍然成立**。

收窄前用下面这条复核真实客户端，**不要照抄任何文档里的清单**（含本文）：

```bash
ps -eo args --no-headers | grep "^postgres: root"
```

> 别用 `pgrep -f "postgres: root"` 配 `/proc/$p/cmdline`：`pgrep -f` 会匹配到你自己
> 那条命令行，产生假阳性（本次排查即被它误导过一次）。

### Casdoor 改走 Docker 网关（实测 2026-09-01）

`/home/docker/casdoor/app.conf` 第 6 行：

```diff
- dataSourceName = "user=root password=*** host=apikv.com   port=52288 sslmode=disable dbname=casdoor"
+ dataSourceName = "user=root password=*** host=172.18.0.1 port=52288 sslmode=disable dbname=casdoor"
```

为什么是 `172.18.0.1` 而不是容器名：**两个容器不在同一 Docker 网络**
（casdoor 在 `casdoor_default` 172.18，postgres 在 `postgres_default` 172.19），
容器名解析不到，实测 `172.19.0.2:5432` 直连也不通。`172.18.0.1` 是 casdoor 所在网络的
宿主网关，映射端口 52288 在其上可达（改前已用一次性容器验证过认证与选库）。

变更后实测：PG 侧 casdoor 连接源地址变为 `172.19.0.1`，**公网源连接归零**；
`/api/health` 200、`get-app-login` 200、公网 `https://casdoor.apikv.com/` 200；
`docker compose up -d --force-recreate` 后复验仍为内网源——`dataSourceName` 不在
compose 的 environment 里（只有注释掉的一行），`app.conf` 是唯一真相源，故变更持久。

⚠️ 该容器 `restart: no`，宿主重启不会自动拉起，与本次变更无关但收窄端口时要一并留意。
回滚：`app.conf.bak-20260901-230518` 同目录留存。

### P0：node1 `redis_gorse` 61246 —— 全网开放

`.service-matrix.yaml` 标了「测试期对 0.0.0.0/0 开放，上线前收窄」。实测确认配置为
`port 0` + `tls-port 6379` + `requirepass` 已设，只收 `rediss://`，比 pg 强。

**与 pg 不同，这个端口的 `used_by` 是准确的**：实测只有一条连接，来自 node2
（`node2`）的 gorse。**可以直接收窄到只放 node2**，无 Casdoor 那类隐藏消费者。

### P1：两台 `ufw` 均 inactive

只靠云厂商安全组，主机侧无第二道。收窄上面两个端口时一并考虑落到 nftables。

## 运维手册

```bash
# 状态
fail2ban-client status
fail2ban-client status sshd

# 改配置后（先语法检查再 reload，不要直接 restart 丢掉封禁状态）
fail2ban-client -t && systemctl reload fail2ban

# 看真正生效的合并配置（.local 合并顺序容易看走眼，不要靠读文件推断）
fail2ban-client -d | grep -A5 ignoreip

# 手工解封
fail2ban-client set sshd unbanip <IP>
```

**改本文件里的配置时，两台机器上的 `/etc/fail2ban/jail.d/*.local` 要同步改**——
配置里已写了指回本文档的注释，别让两边漂移。

### 把自己关在门外时

两台都**没有**装 ufw 拦截，且 `ignoreip` 覆盖了管理段，正常不会发生。真发生时：

- node2 是阿里云，有实例元数据（`i-7xv821m852o368f5uifw`），走控制台 VNC；
- node1 无阿里云元数据，依赖厂商控制台的带外通道；
- 做高风险改动前可先挂一个自动回滚的定时任务（本次部署即用此法兜底，改完已清理）。
