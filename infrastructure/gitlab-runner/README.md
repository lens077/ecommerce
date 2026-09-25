# GitLab Runner（集群内 Kubernetes executor）

gitlab.com 共享 runner 的计算分钟用完后（2026-09-24），项目关闭了共享 runner（`shared_runners_enabled=false`），GitLab CI 的全部 job 都由这个自建 runner 执行。

| 项 | 值 |
|---|---|
| GitLab runner | project runner `k8s`，id `56697756`，`run_untagged=true`（`.gitlab-ci.yml` 不写 tags） |
| 部署 | 集群 `gitlab-runner` ns，Helm chart `gitlab/gitlab-runner` 0.93.0，本目录 `values.yaml` |
| 并发 | `concurrent = 1` |
| build 容器默认预算 | 请求 1C/1Gi，上限 2C/1Gi；helper 64Mi/512Mi |
| 轻检查预算 | `context-gate`、`gitleaks` 在 CI 中同时覆盖 memory request/limit 为 512Mi |
| 构建试验预算 | `backend-gate`、`frontend-gate` 显式设置 memory request/limit 为 1Gi；Go 包编译与前端 workspace 任务串行化 |
| 调度边界 | manager 与 job 均通过 required node affinity 排除 control-plane 节点 |
| token | Secret `gitlab-runner/gitlab-runner-token`（键 `runner-token`），不入库 |

曾先在 node2（2C/1.6G）部署 Docker runner：`go build ./...` 在 1 GiB job 上限下重度换页（swap 2.3 GiB、CPU 约 5%），38 分钟未编完、必撞 1 小时超时。当天整体撤掉，node2 上的容器、配置、swap 与 sysctl 改动均已还原。

## 部署

```bash
# 在 Bash 中执行；仅用于首次部署，已有 runner 不要重复创建。
set -euo pipefail
kubectl create ns gitlab-runner
# 先确认 API 成功且 token 非空，再创建 Secret；不回显、不写本地文件。
RUNNER_TOKEN=$(glab api user/runners -X POST -f runner_type=project_type -F project_id=83474117 \
    -f description=k8s -f tag_list=k8s -F run_untagged=true -F locked=true \
  | python3 -c 'import sys,json; t=json.load(sys.stdin)["token"]; assert t.startswith("glrt-"); sys.stdout.write(t)')
[[ -n "$RUNNER_TOKEN" ]]
printf '%s' "$RUNNER_TOKEN" | kubectl -n gitlab-runner create secret generic gitlab-runner-token \
  --from-file=runner-token=/dev/stdin --from-literal=runner-registration-token=
unset RUNNER_TOKEN

helm repo add gitlab https://charts.gitlab.io
helm upgrade --install gitlab-runner gitlab/gitlab-runner --version 0.93.0 \
  -n gitlab-runner -f infrastructure/gitlab-runner/values.yaml --wait

glab api projects/83474117 -X PUT -F shared_runners_enabled=false
```

## 验证

```bash
glab api projects/83474117/runners           # k8s online
kubectl -n gitlab-runner get pods            # manager 1/1 Running；跑 job 时多出 runner-* Pod
glab api 'runners/56697756/jobs?per_page=5'  # 最近 job 由 k8s 接单
```

## 按 job 分配资源

Runner 通过 `memory_request_overwrite_max_allowed` 与 `memory_limit_overwrite_max_allowed` 开启有限覆盖，两项上限均为 1Gi。CI 使用 `KUBERNETES_MEMORY_REQUEST` 和 `KUBERNETES_MEMORY_LIMIT` 选择预算，必须一起设置。覆盖功能限制最大值，不会自动强制 request 等于 limit；修改 CI 时仍需核对两者。

GitLab 项目/组/流水线变量的优先级高于 YAML job 变量，能够覆盖预算；这不是集群强制的最小内存策略。不要在这些上层变量中设置 `KUBERNETES_MEMORY_REQUEST/LIMIT`。需要校验实际资源时以生成的 Pod spec 为准，查询变量时只输出名称，不输出凭据值。

用户要求改为 1Gi 构建试验，request/limit 和覆盖上限均改为 1Gi。此前 3Gi 是未经峰值验证的初始预算，不是构建的最低要求。低内存参数为 `GOFLAGS=-p=1 -gcflags=github.com/elastic/go-elasticsearch/v9/esapi=-l`、`GOMAXPROCS=1`、`GOGC=20`、`GOMEMLIMIT=400MiB`，测试添加 `-parallel=1`；前端保持原检查范围，workspace test/build 使用 `--concurrency-limit 1`，`CI_LOW_MEMORY=1` 将各应用的测试 worker、Next 页面生成 worker 限为 1。CI 设置 `NODE_OPTIONS=--max-old-space-size=256`、`RAYON_NUM_THREADS=1`，lint 使用 `--threads=1`；type-aware lint 的 Go 子进程另受 `GOMAXPROCS=1`、`GOGC=20`、`GOMEMLIMIT=256MiB` 控制。`esapi=-l` 仅改变该依赖的 CI 内联优化，不关闭类型检查或影响发布镜像参数。构建验证范围见下文，不能等同于 GitLab job 已完成验收。Go 内存软限制不等于整个进程树的硬上限，实际仍由容器 1Gi limit 约束。

旧 GitLab main 若仍配置 3Gi，Runner 会拒绝覆盖；需发布更新后的 CI 配置，或对单次测试明确覆盖为 1Gi，不能把工作树改动误认为远端已生效。本轮先用 worker 上固定提交的独立 Pod 测试相同构建命令，结果不等于 GitLab job 已验收。禁止调度到 control-plane、单并发和内存硬上限保持不变。

配置字段见 [GitLab Kubernetes executor 文档](https://docs.gitlab.com/runner/executors/kubernetes/#memory-requests-and-limits)。

## 1Gi 构建试验（2026-09-26）

固定 GitLab main 提交 `931b3c49`，在 worker 上使用独立 Pod、1Gi request/limit、2 CPU limit 顺序执行与 CI 对应的构建命令，没有触发 GitLab job。

- 后端在 k3，已设置 `GOFLAGS=-p=1`、`GOMAXPROCS=1`、`GOMEMLIMIT=700MiB`；约 7 分 42 秒后在 `go build ./...` 阶段 `OOMKilled`（137）。节点内核日志明确为 `CONSTRAINT_MEMCG`，受害进程是 `compile`；vet/test/lint 尚未执行。
- 前端在 k2；测试期间节点短暂 NotReady、日志请求 TLS 握手超时，因此主动停止测试。随后节点恢复 Ready，未取得足以判断前端构建成功或 OOM 的日志，不把节点异常直接归因于前端。
- Runner 保留用户要求的 1Gi 配置；这不是「构建已通过」的结论。后续可在明确授权后继续分析单包编译峰值或调整预算，不能擅自恢复 3Gi。CI 文件尚需发布，旧 3Gi job 会被 1Gi 覆盖上限拒绝。

### 降低 GC 预算的后续试验

同一提交、冷缓存、1Gi 硬上限，Go 改用 `GOGC=20`、`GOMEMLIMIT=400MiB`（CPU limit 降为 1）。构建期间 k2 再次出现 `NodeStatusUnknown`、SSH 无响应，测试被中止并请求删除 Pod；未取得成功结果或新 OOM 证据，不能量化优化收益。前端阶段未启动。节点健康恢复并排查原因之前，不继续在共享业务 worker 上反复试压；Pod `Terminating` 也不等于节点上的进程已停止。

### 隔离 Docker 验证结果

为避免继续影响共享 worker，后续验证移到 Mac Docker Desktop，使用 linux/amd64 的 `golang:1.27` / `node:24`、固定提交 `931b3c49` 加上述前端配置改动、1Gi memory/memory-swap、1 CPU。Mac 是 ARM，含模拟开销，耗时不能直接外推为集群性能；没有运行 GitLab job。

| 试验 | 结果 |
|---|---|
| 仅降低 Go GC 预算 | `esapi` 编译仍被杀，cgroup `oom_kill=1` |
| 仅对 `esapi` 关闭内联 | 单包约 28 秒成功，峰值 806133760 bytes，`oom_kill=0` |
| 使用上述 GOFLAGS 的全后端 build/vet/short test | 全部成功；部分复用前轮缓存，不能称冷构建耗时；峰值触及 1Gi，`oom_kill=0` |
| 再用全新 GOCACHE 编译全部后端 | 成功，`oom_kill=0`；期间暂停过容器，日志墙钟耗时不用于性能比较 |
| golangci-lint revive-exported | 正常完成，峰值 298516480 bytes，无 OOM；418 条告警与原始 418 条基线完全一致 |
| 前端 Node 384MiB，未限制 tsgolint GC | type-aware lint 的 tsgolint 被杀，consumer build 137 |
| Node 256MiB + tsgolint GC 预算 + workspace 串行 | fmt/lint/test/全部 workspace build（含 tsc）通过；任务缓存关闭，峰值触及 1Gi，`oom_kill=0` |

隔离试验最后的 knip 棘轮因 `createServerTransport` 过时基线返回非零。随后在独立工作区安装锁定依赖并核对源码：该导出已不存在，重新生成基线只删除此一条，33 条其它基线不变，check 通过。没有关闭检查或加入新的豁免。以上结果不证明当前共享 worker 健康问题已解决，也不等同于端到端 CI 验收。

## 终态 Pod 排查

`Error` 或退出码 `137` 不能单独证明 OOM。先读 Pod 的 `status.reason/message`、容器 termination 状态，再核对 GitLab job 状态和日志。

2026-09-25 排查此前的 `context-gate`：Pod 在 k2，`activeDeadlineSeconds=3601`，最终原因为 `DeadlineExceeded`。GitLab job 已被取消，但 Pod 内检查随后全部通过（`command_exit_code=0`），未及时清理的容器最终被 kubelet 按期限终止。APK 安装约耗时 36 分钟，是该次执行的主要耗时。

同期 control-plane SSH/API 不可达可能影响取消与清理；旧 manager 日志已缺失，不能进一步断定清理失败原因，更不能据此认定 k1 OOM。当前单并发、排除 control-plane 是风险隔离措施，不是对历史故障根因的证明。升级 manager 前先确认没有活动 job，避免中途切换增加排查难度。

## 注意

- **helper 镜像**：chart 新版默认从 `registry.gitlab.com` 拉 helper，集群只给 `docker.io` 配了 Spegel 与镜像站，所以 `values.yaml` 显式指定 `gitlab/gitlab-runner-helper:x86_64-v19.4.0`。升级 chart 时同步改这个 tag。
- **APK 源**：`context-gate` 使用清华 HTTPS Alpine 镜像，保持原有版本与包签名校验。2026-09-25 在 k2 的 512Mi 临时 Pod 中，同一组依赖安装约 5 秒；该结果是独立 Pod 测试，不等同于 GitLab job 验收。
- **Go 代理**：`proxy.golang.org` 从集群不可达（2026-09-24 从 Pod 实测 15s 超时），`.gitlab-ci.yml` 用 `GOPROXY=https://goproxy.cn|direct`。
- **无缓存服务器**：没配 S3 缓存，`cache:` 会提示 `No URL provided`，每次冷下载依赖（goproxy.cn 很快，可接受）。
- **runner 离线**：所有 job 会一直 pending。临时救急 `glab api projects/83474117 -X PUT -F shared_runners_enabled=true`（需要 gitlab.com 计算分钟）。
- **资源审计**：build 容器设置 CPU/内存请求和上限；helper 与 manager 未设置 CPU limit，不能据此宣称已满足所有 Kyverno 资源策略。
- **镜像缓存**：`if-not-present` 配合可变 tag 会保留节点缓存的旧 digest。升级镜像时显式核对各节点 digest；当前仅用于本项目锁定的 runner，不作为多租户私有镜像隔离机制。
- **轮换 token**：删掉 GitLab 上的 runner（`glab api runners/<id> -X DELETE`），按「部署」重新创建并覆盖 Secret，`kubectl -n gitlab-runner rollout restart deploy/gitlab-runner`。
