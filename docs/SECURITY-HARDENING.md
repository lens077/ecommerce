# 安全加固：边缘主机与不可信反序列化

本文只保留当前可执行的安全边界和不可信反序列化判据。主机运行态不在本文维护；节点、端点、组件状态按 [`context/team/local-env.md`](../context/team/local-env.md) 和 `env-check.py` 现查。拓扑与外部依赖查 [`.service-matrix.yaml`](../.service-matrix.yaml)。

## 1. 范围与当前边界

- `node0`、`node1`、`node2` 是 Kubernetes 集群外的 SSH inventory alias；当前 Kubernetes 节点身份是 `k1`、`k2`、`k3`。两组命名不能互换。
- 主机加固覆盖 SSH、Docker 白名单、本机 HTTP/TLS 检查、磁盘和告警状态。集群内的 NetworkPolicy、Cilium、Tetragon、OpenBao/ESO 与 east-west 身份由集群配置和 [告警通知手册](observability/alerting-notification.md) 管理。
- 不把一次攻击计数、Ready、容器存在或证书文件存在写成长期健康结论。部署、轮换、重启和真实发送都必须按对应 Runbook 获取授权；本文不提供自动执行入口。

## 2. 主机侧安全规则

- SSH 只允许密钥认证；密码登录、root 远程登录和把凭据放进命令参数均禁止。修改前确认带外恢复路径，避免把自己锁在主机外。
- Docker 检查使用显式 `WATCH` 白名单，不扫描所有容器。停用容器和历史服务不应加入白名单，否则会制造持续误报并损害告警可信度。
- 主机通知使用现有 `host-watchdog` 安装器与状态机。凭据写入远端 owner-only 文件；`NTFY_TOPIC`、token、真实 topic 和 operator CIDR 不进入仓库。测试使用独立 `WATCHDOG_MODE=test`、状态目录和 test topic。
- HTTP 检查优先使用真实域名和 TLS 校验；需要探测本机 TLS-only 服务时使用 `--resolve`，不使用 `-k`。期望 `401`/`403` 的受保护健康端点可在 `HTTP_CHECKS` 的 `CODES` 中显式声明。
- 修改防火墙、fail2ban、证书、Docker 端口保护或告警规则前，先读 [`docs/INFRASTRUCTURE-OPERATIONS.md`](INFRASTRUCTURE-OPERATIONS.md) 和 [`infrastructure/host-watchdog/README.md`](../infrastructure/host-watchdog/README.md)，再用当前 alias 查询来源网段；不要复制历史 IP 或旧主机名。

## 3. 只读检查

```bash
python3 scripts/env-check.py --section local
python3 scripts/env-check.py --section cluster --context <kube-context> --namespace ecommerce
ssh node0 'systemctl is-active docker; docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}"'
ssh node1 'systemctl is-active docker; docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}"'
ssh node2 'systemctl is-active docker; docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}"'
```

这些命令只产生点时证据。`unknown`、超时或权限失败不能解释为未部署；查询结果不得抄回长期文档作为健康基线。

## 4. Python pickle 反序列化防护

<a id="pickle-deserialization"></a>

### 4.1 判据

外部或可被篡改的数据不得交给 `pickle.load`、`pickle.loads`、`Unpickler.load` 或允许对象重建的间接入口。数据经过 Base64、压缩、HTTPS、登录、内部 Redis 或「来自内网」不会自动变可信。优先使用 JSON 或固定 Schema 的 Protobuf，并限制字段、长度、嵌套深度和处理资源。

典型风险链：

```text
攻击者控制上传内容、缓存值、队列消息或模型文件
  -> 服务把字节当作可信 pickle 加载
  -> 对象重建操作在服务进程中执行代码
  -> 读取/修改该进程可见数据、使用凭据或发起网络连接
```

反向 Shell 只是可能的利用结果，不是漏洞成立的必要条件；目标进程权限、挂载和出站策略决定实际影响。

### 4.2 遗留兼容

必须保留历史 pickle 时，先验证可信生产者签名或 HMAC，再使用精确 `(module, name)` 白名单的 `Unpickler.find_class`；白名单不是沙箱。加载过程应在低权限、最小凭据、受限资源和受限出站的独立进程中执行。不要把 YAML 的不安全 Loader、`dill`、`cloudpickle`、`shelve`、`joblib.load`、`pandas.read_pickle`、`jsonpickle` 或 NumPy/PyTorch 的 `allow_pickle` 当作安全替代。

### 4.3 本仓检查范围

当前静态检查覆盖本仓非忽略的 Go、Python、Shell、CI 配置和依赖声明，检索直接与间接加载入口、别名导入、生产路径和 YAML Loader；未执行攻击载荷，也未连接线上服务。已核对的 Python 运维输入使用 JSON 解析，包括 CES 审计与宿主通知脚本；未发现本仓业务代码把不可信输入送入 Python 对象重建。

该结论不覆盖被忽略的虚拟环境、`node_modules`、二进制产物、真实部署镜像、同级 `control-tower` 仓库或外部服务，也不替代依赖漏洞扫描。新增接口、依赖或模型加载功能时，必须从数据写入者追到加载点重新检查。

## 5. 验收边界

- 主机检查：确认 SSH、Docker 白名单、systemd、TLS、磁盘和通知状态来自当前目标，不复制历史快照。
- 告警检查：故障、重复、恢复和发送失败分别验证；服务接受通知不等于手机送达。
- 反序列化检查：证明不可信输入不会进入对象重建加载器，而不是只观察请求是否报错。
- 本文不宣称线上已完成全量安全、容量、恢复或供应链验收；剩余项以 `TODO.md` 与对应运维手册为准。
