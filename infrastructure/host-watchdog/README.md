# host-watchdog —— 主机侧巡检

补黑盒探针（Gatus）结构上探不到的那一层：容器进程、systemd 单元、本机 HTTP 端点、
隧道站点在线状态、磁盘水位。

**为什么需要它、判据与纪律见 [`context/team/host-watchdog.md`](../../context/team/host-watchdog.md)。**
本文件只讲怎么部署和调参。

## 部署

```bash
./install.sh <ssh-host> --dry-run    # 先看会做什么,不改远端
./install.sh <ssh-host>              # 幂等,可重复执行(升级脚本也跑这个)
```

安装内容：

| 路径 | 内容 |
|---|---|
| `/usr/local/bin/host-watchdog` | Bash 巡检脚本（0755） |
| `/usr/local/lib/host-watchdog/notify.py` | Python 标准库通知状态机（0644） |
| `/etc/systemd/system/host-watchdog.{service,timer}` | 每 5 分钟触发，另加随机延迟 |
| `/etc/host-watchdog/watchdog.env` | 配置与凭据（0400，首次生成模板，**重跑不覆盖**） |
| `/var/lib/host-watchdog/state` | 重启计数诊断基线，不用作通知发送状态 |
| `/var/lib/host-watchdog/incidents.json` | 每个检查项的故障与成功发送状态（0600） |
| `/var/lib/host-watchdog/incidents.json.lock` | 跨进程通知状态锁（0600） |
| `/var/lib/host-watchdog-test/` | 显式 test 模式的独立状态目录 |

装完必须手工填 `/etc/host-watchdog/watchdog.env`。**凭据不入库**（AGENTS.md 硬规则 4），
可以从同项目已有的 ntfy 通道直接取，例如：

```bash
ssh <ntfy-creds-host> 'grep -E "^NTFY_" /path/to/ntfy.env' \
  | ssh <target-host> 'cat >> /etc/host-watchdog/watchdog.env'
```

这样 token 不会出现在终端输出或命令历史里。

## 配置项

全部**按需启用**——留空即跳过，所以同一份脚本可以直接放到任意主机。

| 变量 | 说明 | 示例 |
|---|---|---|
| `HOST_LABEL` | 告警标题里的主机名 | `node1` |
| `WATCH` | 容器名白名单，空格分隔 | `pangolin gerbil traefik` |
| `SYSTEMD_UNITS` | systemd 单元 | `docker.service` |
| `HTTP_CHECKS` | `名字=URL`，期望 2xx/3xx；另支持两个可选段，见下 | `order=http://127.0.0.1:8080/healthz` |
| `PANGOLIN_DB` | 填了才检查隧道站点在线状态（只读打开） | `/home/docker/pangolin/config/db/db.sqlite` |
| `DISK_PATHS` / `DISK_WARN_PCT` / `DISK_CRIT_PCT` | 挂载点、待办水位、核心满盘风险水位 | `/` / `85` / `95` |
| `NTFY_URL` / `NTFY_TOPIC` / `NTFY_TOKEN` | HTTPS ntfy 出口；已有 topic 作为核心 page 通道 | — |
| `NTFY_TICKET_TOPIC` | 待办通道，磁盘 >=85% 使用此通道；缺失时明确报错并保留 pending，不回退核心通道 | — |
| `NTFY_TEST_TOPIC` | 隔离测试通道，不能等于 page 或 ticket | — |
| `NOTIFY_HOLD_SECONDS` / `NOTIFY_RECOVER_SECONDS` | 首次故障持续确认 / 恢复确认秒数 | `600` / `300` |
| `NOTIFY_STATE_FILE` | 生产通知状态文件，路径固定后不要随意更换 | `/var/lib/host-watchdog/incidents.json` |
| `WATCHDOG_MODE` | 正常运行用 `production`；测试必须显式用 `test` | `production` |
| `WATCHDOG_TEST_STATE_DIR` | test 模式的独立重启/通知状态目录，不可与生产重叠 | `/var/lib/host-watchdog-test` |
| `NOTIFY_TEST_STATE_FILE` | 可选 test 通知状态覆盖；必须独立于生产状态 | test 目录下的 `incidents.json` |
| `PANGOLIN_IGNORE_SITES` | 空格分隔的精确站点名；默认只忽略开发机 `mac`，不按 tunnel 类型排除 | `mac` |
| `HC_PING_URL` | 可选检测器心跳：扫描和通知处理完成即成功 ping；业务故障不发 `/fail`；test 禁用 | — |

升级只安装脚本，不覆盖现有凭据文件，也不把本机环境变量复制到远程。由操作者通过既有凭据渠道补齐两个新 topic；不要把凭据作为安装器参数或写入仓库。所有通道必须事先赋予发布权限。

⚠️ **`WATCH` 用显式白名单，不要图省事改成全量扫描**——理由见 context 文档，
简短版：机器上停用的容器会变成常驻误报，而常驻误报会毁掉整个通知渠道的可信度。

### `HTTP_CHECKS` 的三种写法

```
名字=URL                        普通探测，期望 2xx/3xx
名字=URL|host:port:ip           带 --resolve
名字=URL|host:port:ip|CODES     再指定期望状态码，逗号分隔
```

**`--resolve` 解决 TLS-only 端点的两难**（node2 的 Harbor/MinIO 实测）：
直接探 `https://127.0.0.1:port` 会因证书 CN 不匹配返回 `000`（脚本刻意不带 `-k`），
变成永久误报；改探公网域名又会绕出去经 Pangolin，就不再是「本机」探测。
`--resolve` 让域名解析到本地 IP：**TLS 按域名校验，流量不出机器**。

不加 `-k` 是有意的——跳过证书校验会连带放过「证书过期」这类真故障。

**`CODES` 必须用逗号**（`200,403`）。整个 `HTTP_CHECKS` 按空格分词，
写成 `200 403` 会被拆成两个 item，每轮多出两条「格式错误」误报——本次踩过。

需要非 2xx/3xx 的场景比想象中多：要鉴权的端点返回 `401` 恰恰证明它活着
（需要鉴权的服务可用 `200,401`），比强行找一个匿名 200 端点更可靠。

配置示例（node2）：

```ini
HTTP_CHECKS="gorse=http://127.0.0.1:8088/api/health/ready \
minio=https://minio.apikv.com:9000/minio/health/live|minio.apikv.com:9000:127.0.0.1|200,403"
```

Harbor 已于 2026-09-24 从 node2 退役，不得再把 Harbor 容器或 HTTP 端点加入白名单。退役服务若仍在白名单中，host-watchdog 会持续报告「容器不存在」和「HTTP 探测无响应」，形成常驻误报。

## 通知语义

- 每个 Docker 对象、systemd 单元、HTTP 名称、磁盘挂载点、Pangolin `siteId` 都有稳定 key；错误文本变化不会创建新 incident。同一轮多个问题不再拼成一条不断变化的通知。
- 默认首次连续观察到故障至少 600 秒才 firing；没有发过 firing 就自行恢复的事件不会发送 resolved。定时器 5 分钟采样，不承诺精确在第 600 秒发送。
- 已发送事件连续观察健康至少 300 秒才 resolved；未知/缺席的检查不等于恢复。暂停采集期间没有独立证明服务健康或故障。
- page 重复提醒间隔依次为 1、2、4、8、24 小时，随后上限 24 小时；ticket 为 4、8、16、24 小时，随后上限 24 小时。间隔从**上一次成功发送**起算。
- Docker 未运行、unhealthy、systemd 非 active、HTTP 异常和非排除的 Pangolin 站点离线保留 page；磁盘原 85% 阈值保留，改走 ticket；独立 `disk-critical:<挂载点>` 在 >=95% 持续确认后发 page。两个水位分别恢复，避免待办分流掩盖满盘风险。
- `df` 两种读取都失败时，独立 `disk-read:<挂载点>` 发 ticket；原水位检查标 unknown，不伪造恢复或报告 OK。
- 容器 RestartCount 增长只输出诊断；持续未运行或 unhealthy 仍按 page 规则判断。开发机默认只排除站点名严格等于 `mac`；`mac-backup`、其他 `newt` 站点和生产 `newt.service` 不被自动排除。
- 标题是 `[故障][关注] 对象 · 主机`、`[故障][待办] 对象 · 主机`，恢复保留分类并使用 `[恢复]`。正文最多 4 行、3000 UTF-8 字节以内，恢复不复制故障描述。
- 观察状态先落盘；仅 ntfy 接受消息后更新 `last_sent`，发送失败保留待重试事件。恢复与提醒沿用首次 firing 的目标 topic。
- 状态锁覆盖读取、发送和原子落盘，减少并发重复；HTTP 已接受而本地提交前崩溃，仍可能重复一次。不能宣称 exactly-once。
- 非法/损坏状态文件报错退出，不静默删除重建。返回 0 表示当前检查正常；1 表示检查发现问题（可能尚在 hold）；2 表示配置、采集管道或通知状态/发送错误。日志只记录发送错误类型，不打印 URL/token。

## 离线验证与隔离验收

先在仓库运行不依赖网络、Docker 或凭据的回归测试：

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s infrastructure/host-watchdog -p 'test_*.py' -v
bash -n infrastructure/host-watchdog/watchdog.sh infrastructure/host-watchdog/install.sh
```

真实发送必须另获授权，先配置权限隔离的 `NTFY_TEST_TOPIC`。**不得向生产 WATCH 留下不存在的容器，也不得删除生产 state 来造故障。** 以下命令只在目标机获授权的维护会话里执行；凭据文件只加载、不打印：

```bash
set -a
. /etc/host-watchdog/watchdog.env
set +a
# 使用新建且独立的目录；整个测试始终用同一个目录，结束后按维护流程清理。
export WATCHDOG_TEST_STATE_DIR="$(mktemp -d /tmp/host-watchdog-test.XXXXXX)"
export WATCHDOG_CONF=/dev/null WATCHDOG_MODE=test
export HOST_LABEL=watchdog-isolated-test
export WATCH=does-not-exist SYSTEMD_UNITS= HTTP_CHECKS= PANGOLIN_DB=
# 仅测试环境缩短时间。test topic 缺失/等于生产 topic 会在采集前拒绝。
export NOTIFY_HOLD_SECONDS=0 NOTIFY_RECOVER_SECONDS=0
/usr/local/bin/host-watchdog  # 首次 firing，rc=1
/usr/local/bin/host-watchdog  # 相同问题不重复发送，rc=1
# 显式健康观察（不要直接删除监控项冒充恢复）：使用假时钟单元测试验证 resolved；
# 实际端到端恢复应换成独立可控测试 endpoint，由维护者先故障、后恢复。
```

测试模式独立通知/重启状态，禁用生产 Healthchecks ping；**标签带 test 不构成隔离，必须 WATCHDOG_MODE=test**。真实 resolved 验收要用独立可控检查对象，不能停止生产服务来制造故障。

不要用读 topic 历史来判断发布成功：只写 token 读历史可能 403。helper 验证 HTTP 2xx 且 JSON `event=message`；手机实际送达仍需人工确认。

## 兼容性

只用 POSIX 与 Bash 3.2 可用语法，`install.sh` 可从 macOS 直接跑。
问题列表刻意用字符串累加而非数组——`set -u` 下展开空数组在 Bash 3.2 会
`unbound variable`，见 [`context/team/shell-scripting.md`](../../context/team/shell-scripting.md)。

远端前置：`python3`（隧道站点检查用）和 `systemd`。只有 `WATCH` 非空时才需要 Docker；
在 k1/k2/k3 这类仅运行 containerd 的 Kubernetes 节点上，保持 `WATCH=""`，改用
`SYSTEMD_UNITS="kubelet.service containerd.service newt.service"` 和 kubelet 本机健康端点。
