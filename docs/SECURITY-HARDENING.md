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

下面是脱敏模板。`node1`、`node2` 是维护机的 SSH alias，远端 fail2ban 不读取
`~/.ssh/config`；安装时必须注入对应地址。参数来源与重建步骤见
[基础设施恢复与可观测性运维手册](INFRASTRUCTURE-OPERATIONS.md#2-公网地址注入与重建)。

```ini
[DEFAULT]
backend            = systemd
banaction          = nftables-multiport
banaction_allports = nftables-allports
allowipv6          = yes

ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 \
           <operator-egress-cidr> node1 node2 <node3-egress-cidr>

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
- **node3 写 `<node3-egress-cidr>` 而不是单个 IP**〔2026-09-02 修正〕：node3 在 NAT 后
  （内网 `10.10.21.172`），SSH 入站地址与出站 egress 地址不同。
  原来只白名单了 SSH 入站地址，结果 node3 作为客户端去连 Harbor 时
  以另一个 egress 地址出现，实测被 `harbor-auth` 封了——node3 上跑着 Gatus 探针与 CDC，
  被封等于探针失明。`/29` 同时覆盖两者且只放 8 个地址。
  **判据**：白名单一台 NAT 后的机器，要查它的 egress（`curl ifconfig.me`），
  不能只抄 `/etc/hosts` 里的入站地址。
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

## Web 服务的 jail：哪些能做、哪些不能、为什么

上一轮计划里的 Vaultwarden / Casdoor / Harbor jail 经实测逐个判定。
**Harbor 的结论在 2026-09-02 被复测推翻**（见下），其余维持。

| jail | 实测发现 | 结论 |
|---|---|---|
| `vaultwarden` | 全量日志中 `Username or password is incorrect` **0 条**（2026-09-01） | 它在 Pangolin SSO 之后，爆破打不到自己的登录表单，jail 封不到任何东西。**不部署** |
| `harbor`（读 nginx `proxy.log`） | 源 IP 全是 **`172.18.0.1`**（Docker 网桥网关） | **绝对不能按这份日志封**——会把反向代理自己封掉，Harbor 整体下线。**不部署** |
| `harbor-auth`（读 `core.log`） | 真实 IP **一直都在**，且**不可伪造**（2026-09-02 复测） | **已部署**，见下节；但封禁在 node2 上**打不到人** |
| Traefik 通用 jail | Traefik 只配了 `log`（自身日志），没配 `accessLog` | 无 per-request 日志可读 |

### Harbor：真实 IP 透传本来就是通的，上一版结论看错了地方

2026-09-01 那版写「Harbor 拿不到真实 IP，配 jail 等于自伤」，**是错的**。
错因是只看了 nginx 的 `proxy.log`——它的 `log_format` 里确实没有 `$http_x_forwarded_for`
字段，所以只记 `$remote_addr` = 网桥 IP。但链路本身是完整的：

```
Pangolin 设 X-Forwarded-For
  → Harbor nginx 用 $proxy_add_x_forwarded_for 转发（配置里本来就有）
    → harbor-core 解析并记进 core.log 的 client IP 字段
```

`core.log` 实测有两种形态，**第一个 IP 都是真实客户端**：

```
client IP="<direct-client-ip>"                 直连/单跳
client IP="<node3-egress-ip>, 172.18.0.1"    经 Pangolin → nginx，网桥在后
```

**伪造测试过不了**：从外部发 `X-Forwarded-For: 192.0.2.9`，日志里 `192.0.2.9` 出现 **0 次**，
记的仍是真实源。Pangolin 是**覆盖**而非追加 XFF——这是能拿第一个 IP 做封禁依据的前提。
若将来 Harbor 不再经 Pangolin 直接暴露，这个前提失效，jail 必须停用。

### `harbor-auth` 只覆盖 API 路径，不覆盖网页表单

上一版写「55 条失败只有 2 条带 IP，可封率 4%」，数字对、解读错。两类日志来自**不同的认证入口**：

| 来源 | 日志形态 | 带 IP？ |
|---|---|---|
| `basic_auth.go`——API / `docker login` / Helm | `client IP="..." ... failed to authenticate user` | **是** |
| `base.go UserLogin`——网页登录表单 | `Error occurred in UserLogin: ...` | 否 |

所以 jail 覆盖的是 **API 路径**，网页表单的失败它看不见。这不是缺陷：
撞库脚本走的正是 API/basic auth，而网页表单在 Pangolin SSO 之后本就打不到。

### 部署与验证（实测 2026-09-02）

`/etc/fail2ban/filter.d/harbor-auth.local`：

```ini
[Definition]
failregex = ^.*\[ERROR\].*client IP="<HOST>(?:,[^"]*)?".*failed to authenticate user
ignoreregex =
datepattern = ^%%b %%d %%H:%%M:%%S
```

`(?:,[^"]*)?` 吃掉逗号后的网桥 IP，`<HOST>` 只捕获第一个。

`/etc/fail2ban/jail.d/20-harbor.local`：

```ini
[harbor-auth]
backend  = polling
enabled  = true
filter   = harbor-auth
logpath  = /var/log/harbor/core.log
port     = 41311,49600,http,https
maxretry = 5
findtime = 10m
bantime  = 24h
```

从 node3 打 6 次错误认证：jail 正确封禁 `<node3-egress-ip>`（node3 真实 IP），
nft 里 `172.18.0.1` 出现 **0 次**，Harbor 对其他客户端全程 200。**没有封到反向代理自己。**

#### ⚠️ 坑：`[DEFAULT]` 的 `backend = systemd` 会让 `logpath` 被静默忽略

第一次上线时 jail 显示 `Total failed: 0`，看起来像 filter 没匹配。真因是 `00-defaults.local`
里的 `backend = systemd` 被继承，jail 跑去读 journal，**完全忽略 `logpath`**。
`fail2ban-client status` 一切正常，极易误判；唯一判据是：

```bash
fail2ban-client get harbor-auth logpath
# 坏：No file is currently monitored
# 好：Current monitored log file(s): /var/log/harbor/core.log
```

修法是在 jail 里显式写 `backend = polling`。**读文件的 jail 一律要显式覆盖 backend。**

### ⚠️ 检测有效，但封禁在 node2 上打不到人

这是必须如实写下的半成品状态。到达 node2 Harbor 端口的连接源地址是：

```
127.0.0.1:49600  ←  127.0.0.1:51954     newt 隧道
```

流量经 node1 的 Pangolin 隧道进来，node2 的防火墙看到的是 **`127.0.0.1`**，
nft 里那条 `<node3-egress-ip>` 永远匹配不到——实测被封的 node3 仍拿到 **200**。

**当前收益是审计**：`fail2ban-client status harbor-auth` 能给出真实攻击源清单，
这在之前是完全不知道的。**要真正拦住，封禁必须放在流量终止的 node1**，三个方向：

1. **Harbor 内建账号锁定**——`core.log` 里的 `failed_signin_limit` / `failed_signin_frozen_time`
   字段说明它自带；按账号锁比按 IP 封更对症（分布式撞库换 IP 不换账号），且不受隧道影响。**优先查这条**
2. Traefik 开 `accessLog`（当前只有 `log`），在 node1 跑 fail2ban 读它——通用，但要动 Pangolin 配置
3. Badger 插件（`github.com/fosrl/badger` 已装）可能自带限流/封禁，查文档

> **可复用的判据**：反向代理后面配 jail，要分开验三件事——
> 日志里的 IP 是不是真实源（看应用日志，不要看代理的 access log）、
> 能不能伪造（从外部塞一个假 XFF 看它进不进日志）、
> **封了之后流量是不是真的从那个 IP 来的**（看 `ss` 的 peer address）。
> 本次前两件过了，第三件没过——隧道把源地址换成了回环。

## 仍未关闭的高危项（fail2ban 解决不了）

这些优先级**高于**本次做的 SSH 加固，因为 SSH 已经因端口迁移 + 禁密码而实际安全。
下面两项原本对全网敞开；**来源收窄、TLS 与口令轮换均已于 2026-09-01 落地**（见下）。

### ✅ 已关闭（2026-09-01）：node1 `postgres_gorse` 52288 的明文与弱口令

原状：`0.0.0.0:52288->5432/tcp` 全网可达、`sslmode=disable`、`root` 用弱口令，
而扫描器**正在爆破 `postgres` 用户名**（node2 上 151 次）。端口从 5432 随机化到 52288
只是隐藏，全端口扫描一遍就出来；**fail2ban 保护不了它**——等日志里看到爆破，
弱口令可能已经被撞开。

处置（按「先能连上 TLS，再切客户端，最后堵死明文」的顺序，全程未中断服务）：

1. **复用 Pangolin 的 ZeroSSL `*.apikv.com`**——不额外签证书，与 Traefik 同一份来源。
   拷到 `/home/docker/postgres/tls`，`chown 999:999`、key `0600`（PG 会因权限过宽拒绝启动），
   compose 加 `./tls:/tls:ro`，`postgresql.conf` 开 `ssl=on` + `ssl_min_protocol_version=TLSv1.2`。
2. **轮换 `root` 口令**为 28 位强随机（`openssl rand -base64 32` 去掉 `/+=` 后截断——
   保持**纯字母数字**，DSN 与 URI 里不必转义，省掉一整类连接串解析坑）。
3. **切两个客户端**到 `pg.apikv.com:52288` + `sslmode=verify-full`。
4. **`pg_hba` 远程行改 `hostssl`**，明文连接直接被拒。

验证（实测 2026-09-01）：

| 检查 | 结果 |
|---|---|
| 服务端 `show ssl` | `on`，`openssl s_client` 取到 `CN=*.apikv.com` |
| Casdoor 连接 | `172.19.0.1` / `t` / **TLSv1.3** / `TLS_AES_256_GCM_SHA384` |
| gorse 连接（跨机 node2） | `node2` / `t` / **TLSv1.3** / `TLS_AES_256_GCM_SHA384` |
| 明文 `sslmode=disable` | **被拒**：`no pg_hba.conf entry ... no encryption` |
| `sslmode=verify-full` | 通过，且 **无需自定义 CA**（ZeroSSL 是公共 CA，`sslrootcert=system` 即可） |
| Casdoor / gorse 健康 | `/api/health` 200、`/api/health/ready` 200、公网 casdoor 200 |

**两个必须记住的坑**：

- **证书无 IP SAN**（`DNS:*.apikv.com, DNS:apikv.com`），所以客户端**必须用域名**。
  gorse 原 DSN 写的是 IP `node1:52288`，不改成 `pg.apikv.com` 则 `verify-full` 必失败。
- **容器 hairpin 不通**：容器内解析 `pg.apikv.com` 得到公网 IP，实测直接 timeout。
  Casdoor 的解法是 compose `extra_hosts: ["pg.apikv.com:172.18.0.1"]`——
  **域名仍用于 SAN 校验，流量却走内网网关**，两个目标同时满足。
  （node2 的 gorse 是跨机访问，走公网 IP 正常，不需要这条。）

口令真值只在 node1 与 Config Center，按硬规则 4 不入仓。⚠️ 该口令属 `root` 用户、
`gorse` 与 `casdoor` 两库共用，**下次轮换仍会同时影响两个服务**，须一并重启。

#### ⏰ 到期风险：证书是拷贝，不会自动续期

PG 与 Redis 的证书是从 Traefik 目录 **`cp` 出来的副本，不是软链接**，
所以 **Pangolin 自动续期不会传导过去**。三份实测同为 `notAfter=2026-11-25`。

用户 2026-09-01 明确决定**不做自动钩子**，因此这是一条到期前必须人工执行的动作
（已登记进 `docs/todo/基础设施与部署模型.md`）：

```bash
# 续期后手工同步，两个服务都要做
cp /home/docker/pangolin/config/traefik/certs/apikv.com.crt /home/docker/postgres/tls/server.crt
cp /home/docker/pangolin/config/traefik/certs/apikv.com.key /home/docker/postgres/tls/server.key
chown 999:999 /home/docker/postgres/tls/server.*   # PG 容器实际以 uid 999 运行
chmod 600 /home/docker/postgres/tls/server.key      # 权限过宽 PG 会拒绝启动
docker exec postgres pg_ctl reload -D /var/lib/postgresql/18/docker
# Redis 同理，拷到 /home/docker/redis/tls 后重启容器

# 复验实际下发的证书（不要只看文件）
echo | openssl s_client -starttls postgres -connect 127.0.0.1:52288 2>/dev/null \
  | openssl x509 -noout -dates
```

**漏做的后果**：`verify-full` 的客户端会在到期当天全部连不上，gorse 与 Casdoor 同时挂。

#### ⚠️ 这台 PG 不只服务 gorse —— 收窄前必读（实测 2026-09-01）

这台 PG 上有 `gorse` 与 `casdoor` **两个库**，`used_by` 写成只有 gorse 会漏掉一半。
Casdoor 是 `docs/TECH.md` 选型表里的 IAM，挂掉等于 SSO 全断——实测那次 5 条连接里
**4 条是 Casdoor**：

```
postgres: root gorse   node2(...)   ← gorse，来自 node2
postgres: root casdoor node1(...) ← Casdoor ×4
```

由此得到两条仍然有效的纪律：

1. **改这台 PG 的网络或凭据前，先枚举真实客户端**，不要按 `used_by` 想当然。
   隐藏消费者可能来自本仓之外（Casdoor 就是），且可能以**宿主自己的公网 IP** 出现——
   当时 Casdoor 走 `host=apikv.com` 绕公网连回本机，按「只放 node2」写规则会当场断 SSO。
2. **轮换口令的影响面是两个库。** 口令属 `root` 用户、两库共用，不是「只动 gorse」。

收窄前用下面这条复核真实客户端，**不要照抄任何文档里的清单**（含本文）：

```bash
ps -eo args --no-headers | grep "^postgres: root"
```

> 别用 `pgrep -f "postgres: root"` 配 `/proc/$p/cmdline`：`pgrep -f` 会匹配到你自己
> 那条命令行，产生假阳性（本次排查即被它误导过一次）。

### Casdoor 改走 Docker 网关（实测 2026-09-01）

`/home/docker/casdoor/app.conf` 第 6 行：

```diff
- dataSourceName = "user=root password=*** host=apikv.com    port=52288 sslmode=disable     dbname=casdoor"
+ dataSourceName = "user=root password=*** host=pg.apikv.com port=52288 sslmode=verify-full dbname=casdoor"
```

> 分两步走到这里：先把 `host` 从 `apikv.com` 换成 `172.18.0.1` 消除绕公网，
> 上 TLS 时再换回域名 `pg.apikv.com`（`verify-full` 要校验 SAN），
> 同时用 compose `extra_hosts: ["pg.apikv.com:172.18.0.1"]` 把它钉回内网网关——
> **域名只用于证书校验，流量仍不出内网**。

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

### node1 `redis_gorse` 61246 —— 已收窄

`.service-matrix.yaml` 标了「测试期对 0.0.0.0/0 开放，上线前收窄」。实测确认配置为
`port 0` + `tls-port 6379` + `requirepass` 已设，只收 `rediss://`，比 pg 强。

**与 pg 不同，这个端口的 `used_by` 是准确的**：实测只有一条连接，来自 node2
（`node2`）的 gorse。**可以直接收窄到只放 node2**，无 Casdoor 那类隐藏消费者。

### 两个端口的来源收窄（实测 2026-09-01 已落地）

在 Casdoor 改走 Docker 网关之后，两个端口都已收窄，**不再对 `0.0.0.0/0` 开放**：

放行来源 = `node2`（gorse）+ 运维段 `<operator-egress-cidr>`
+ Docker 网桥 `172.16.0.0/12`（Casdoor 经 `172.18.0.1` 走这条），其余 DROP。

落地在 node1 的 `docker-port-guard.service`（脚本入库副本
`infrastructure/host-watchdog/docker-port-guard.sh`），`enabled` 开机自启；
容器 IP 动态解析，避免容器重建后规则失配。

验证矩阵：

| 检查 | 结果 |
|---|---|
| node3 → 61246 / 52288 | 均 **BLOCKED** |
| node2（gorse）→ 61246 / 52288 | 均 **OPEN** |
| Casdoor HTTP | **200**（SSO 正常） |
| PG 客户端 | gorse 与 casdoor 连接均在 |
| DROP 计数 | 随真实拦截增长（非 0） |

#### ⚠️ 反直觉坑：按宿主端口写规则会得到一条永不生效的死规则

Docker 的 DNAT 在 filter **之前**就把目的端口改写成了容器端口：

```
61246 -> 172.22.0.2:6379      52288 -> 172.19.0.2:5432
```

因此 `DOCKER-USER` 里必须匹配 **DNAT 之后**的「容器 IP + 容器端口」。本次第一版按
`--dport 61246` 写，六条规则计数**全是 0**，外部主机照样连得上——规则看起来完全正确，
实际从未生效。

**判据**：`iptables -L DOCKER-USER -v -n` 的 pkts 必须随真实流量增长，恒为 0 就是没接上。
**并且必须做反向测试**（从一台不在白名单里的机器去连），只验证「白名单内还能连」
会完全漏掉这个 bug——本次正是靠 node3 的反向测试才发现的。

同理，`ufw` 和 `INPUT` 链对 Docker 发布端口也不生效（Docker 走 FORWARD/DOCKER-USER），
下面那条 `ufw inactive` 要按这个前提理解。

### P1：两台 `ufw` 均 inactive

只靠云厂商安全组，主机侧无第二道。收窄上面两个端口时一并考虑落到 nftables。

## Pangolin 暴露面复核（实测 2026-09-01）

上 TLS 后复核了 Pangolin 有没有把这批服务暴露出去。**结论：站点映射无需修改。**

| 域名 | 公网返回 | 判定 |
|---|---|---|
| `pg.apikv.com` | **404** | ✅ 无 HTTP 路由。PG 只经 52288 的 TCP 口对外，且已被 `docker-port-guard` 收窄 |
| `redis.apikv.com` | **404** | ✅ 同上 |
| `casdoor.apikv.com` | 200 | ✅ 本来就该公开（OAuth 端点） |
| `gorse.apikv.com` | 302 → `/login` | ✅ Dashboard 在登录后 |
| `minio.apikv.com` | 403 | ✅ 需凭据 |

**`pg.apikv.com` 解析到 node1 但返回 404 是正确状态**：DNS 是泛解析 `*.apikv.com`，
证书也是泛域名，但 Traefik 没有对应 router，所以 HTTP 层没有入口——
域名只用于 TLS 证书校验，不代表 Pangolin 把数据库暴露了。

顺带探了 gorse 的未鉴权边界：

```
/api/health/ready  200      ← 仅健康检查开放
/api/health/live   200
/api/dashboard/config  401  ← 数据面全部要鉴权
/api/user/1        401
/api/item/1        401
```

只有健康端点匿名可读，**数据面全 401**，可接受。node2 上 gorse 的 `8086/8088`
实测仍绑在 `127.0.0.1`，只能经 Pangolin 进来，没有绕过路径。

### casdoor `8000`：曾记为「公网明文」，复测判定为误报

`docs/todo/` 里长期挂着一条「casdoor `apikv.com:8000` 走公网 http」的 P2，
其证据是 `curl -sI http://localhost:8000/` 返回 200。**这个证据不成立**——
它测的是回环，本机当然通，与公网可达与否无关。

从 node2 与 node3 两个外部位置实测（2026-09-01）：

| 探测 | 结果 |
|---|---|
| `nc -zv node1 8000` | **超时**（两地一致） |
| `nc -zv node1 443` | **成功** |

即 8000 被上游安全组挡在公网之外，OAuth 流量一律经 Pangolin/Traefik 终止 TLS
后进来，不存在明文通道。该条已关闭。

⚠️ 但**主机侧仍无第二道**：宿主是 `0.0.0.0:8000` 监听，`DOCKER-USER` 里也没有
对应规则（不像 52288/61246 有显式 DROP）。安全组一旦放开就立刻裸奔。
要补纵深防御，就给 8000 加一条只放 `172.16.0.0/12` 的规则——当前无暴露，本次未做。

> **可复用的判据**：判断公网暴露必须**从外部主机探**。`localhost` 探测得出的
> 「明文/可达」结论一律无效，这次就是它把一条误报挂了三天。

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
