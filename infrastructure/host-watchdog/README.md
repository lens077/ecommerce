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
| `/usr/local/bin/host-watchdog` | 巡检脚本（0755） |
| `/etc/systemd/system/host-watchdog.{service,timer}` | 每 5 分钟触发 |
| `/etc/host-watchdog/watchdog.env` | 配置与凭据（0400，首次生成模板，**重跑不覆盖**） |
| `/var/lib/host-watchdog/state` | 重启计数基线 |

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
| `HTTP_CHECKS` | `名字=URL`，期望 2xx/3xx | `order=http://127.0.0.1:8080/healthz` |
| `PANGOLIN_DB` | 填了才检查隧道站点在线状态（只读打开） | `/home/docker/pangolin/config/db/db.sqlite` |
| `DISK_PATHS` / `DISK_WARN_PCT` | 挂载点与阈值 | `/` / `85` |
| `NTFY_URL` / `NTFY_TOPIC` / `NTFY_TOKEN` | 告警出口 | — |
| `HC_PING_URL` | 可选 Healthchecks 死人开关 | — |

⚠️ **`WATCH` 用显式白名单，不要图省事改成全量扫描**——理由见 context 文档，
简短版：机器上停用的容器会变成常驻误报，而常驻误报会毁掉整个通知渠道的可信度。

## 验收

```bash
# 1. 正常路径 → rc=0
ssh <host> 'systemctl start host-watchdog.service; journalctl -u host-watchdog -n 10 --no-pager'

# 2. 故障路径 → rc=1 且手机收到 ntfy(不改配置文件,用环境变量覆盖)
ssh <host> 'set -a; . /etc/host-watchdog/watchdog.env; set +a
  WATCHDOG_CONF=/dev/null STATE_FILE=/dev/null WATCH="does-not-exist" \
  /usr/local/bin/host-watchdog'
```

**只跑第 1 条不算验收。** 另外别用「回查 ntfy topic 历史」来判定推送成功——
发布 token 通常是只写不读的，回查会得到 `403`，那不代表没推成功；
看 POST 的状态码（200 + 返回 `"event":"message"`）才作数。

## 兼容性

只用 POSIX 与 Bash 3.2 可用语法，`install.sh` 可从 macOS 直接跑。
问题列表刻意用字符串累加而非数组——`set -u` 下展开空数组在 Bash 3.2 会
`unbound variable`，见 [`context/team/shell-scripting.md`](../../context/team/shell-scripting.md)。

远端前置：`docker`、`python3`（隧道站点检查用）、`systemd`。`install.sh` 会先检查。
