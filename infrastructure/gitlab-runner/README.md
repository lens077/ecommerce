# GitLab Runner（集群内 Kubernetes executor）

gitlab.com 共享 runner 的计算分钟用完后（2026-09-24），项目关闭了共享 runner（`shared_runners_enabled=false`），GitLab CI 的全部 job 都由这个自建 runner 执行。

| 项 | 值 |
|---|---|
| GitLab runner | project runner `k8s`，id `56697756`，`run_untagged=true`（`.gitlab-ci.yml` 不写 tags） |
| 部署 | 集群 `gitlab-runner` ns，Helm chart `gitlab/gitlab-runner` 0.93.0，本目录 `values.yaml` |
| 并发 | `concurrent = 1` |
| build 容器默认预算 | 请求 1C/3Gi，上限 2C/3Gi；helper 64Mi/512Mi |
| 轻检查预算 | `context-gate`、`gitleaks` 在 CI 中同时覆盖 memory request/limit 为 512Mi |
| 重构建预算 | `backend-gate`、`frontend-gate` 显式设置 memory request/limit 为 3Gi |
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

Runner 通过 `memory_request_overwrite_max_allowed` 与 `memory_limit_overwrite_max_allowed` 开启有限覆盖，两项上限均为 3Gi。CI 使用 `KUBERNETES_MEMORY_REQUEST` 和 `KUBERNETES_MEMORY_LIMIT` 选择预算，必须一起设置。覆盖功能限制最大值，不会自动强制 request 等于 limit；修改 CI 时仍需核对两者。

GitLab 项目/组/流水线变量的优先级高于 YAML job 变量，能够覆盖预算；这不是集群强制的最小内存策略。不要在这些上层变量中设置 `KUBERNETES_MEMORY_REQUEST/LIMIT`。需要校验实际资源时以生成的 Pod spec 为准，查询变量时只输出名称，不输出凭据值。

默认预算保持 3Gi，因此尚未提交的 CI 分档配置不影响旧流水线：旧 job 仍会申请 3Gi，而不会把重构建塞入 512Mi。重试旧 job 使用原流水线配置，不会读取工作树的新配置。不要用项目级或整条流水线的 512Mi 变量覆盖，否则 Go/前端构建也会被降低预算。

worker 容量不足时重任务应保持 Pending。不要通过降低 request、允许 control-plane 或取消资源上限来绕过容量限制。需要释放 worker 的已分配请求或扩容后，再验收重构建。

配置字段见 [GitLab Kubernetes executor 文档](https://docs.gitlab.com/runner/executors/kubernetes/#memory-requests-and-limits)。

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
