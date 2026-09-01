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
| `HTTP_CHECKS` | `名字=URL`，期望 2xx/3xx；另支持两个可选段，见下 | `order=http://127.0.0.1:8080/healthz` |
| `PANGOLIN_DB` | 填了才检查隧道站点在线状态（只读打开） | `/home/docker/pangolin/config/db/db.sqlite` |
| `DISK_PATHS` / `DISK_WARN_PCT` | 挂载点与阈值 | `/` / `85` |
| `NTFY_URL` / `NTFY_TOPIC` / `NTFY_TOKEN` | 告警出口 | — |
| `HC_PING_URL` | 可选 Healthchecks 死人开关 | — |

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
（node3 的 Elasticsearch 用 `200,401`），比强行找一个匿名 200 端点更可靠。

配置示例（node2）：

```ini
HTTP_CHECKS="gorse=http://127.0.0.1:8088/api/health/ready \
harbor=https://harbor.apikv.com:49600/api/v2.0/health|harbor.apikv.com:49600:127.0.0.1 \
minio=https://minio.apikv.com:9000/minio/health/live|minio.apikv.com:9000:127.0.0.1|200,403"
```

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
