Status: ready-for-human

# 交接：umami 集成 + 文档治理

## 任务目标

「在当前项目搭建并集成 umami」「部署到 k8s」「写 README 和回写脚本」。后续追加：
删 NATS/CNPG「不能有任何残留」；删历史记录文档；找出制造文档膨胀的规则并整改。

## 已完成

- umami 上集群：公网 `curl https://umami.apikv.com/api/heartbeat` → 200；`POST /api/send` → 200
  且落库（node3 `select url_path from website_event` 见 `/verify-via-pangolin`）。
  websiteId `dd44d749-c072-4ee7-99e9-1c972bdb00bb`，面板 admin/umami（未改密）。
- 前端埋点：`cd frontend && pnpm ready` rc=0。
- 删 NATS/CNPG：ns/PV/CRD/helm 扫描均 0；node4 `vgs` 可用 29G→45G。
- 文档治理：196→143 个 md。`scripts/verify-context.sh` OK、`verify-context-canary.sh` OK（37 探针）、
  `cd backend && go test ./structcheck/...` rc=0。

## 当前状态

已收尾，无进行中编辑。下一步待用户：精简 TODO.md（现 140KB）后把 `verify-context.sh` 的
`todo_budget` 从 160000 调回。

## 关键决策

- umami 清单归 kubernetes 仓 `components/umami/`（用户选），不进本仓 deploy-parity。
- 库走内网直连 `10.10.21.172:5432`，不经 Pangolin（实测 Pod 可达）。
- 拆三项门禁（LIVE-FACT/EVOLOG/TODO-CLEAN）并把 BUDGET 文案由「归档」改「删掉」——
  否则删掉的目录会被重建。
- 否决 `rebalance-spread.sh`：实跑 skew=1 no-op，问题是容量不是分布。

## 未决问题 / 已知约束

- 四个 `*_UMAMI_*` 变量未接进 `frontend-release.yml`，前端当前不采数。
- node5 requests 88% 且今晚抖动 3 次（连累 umami 重启）；仅 node4/node5 可调度
  （node3 有 `workload=pigsty-host` taint）；`metrics-server` 0/1，`kubectl top` 不可用。
- consul/argocd 仍跑但无消费者（catalog 空、0 Application），用户未点名删。
- `components/openfga/component.env` 的 `DEPENDS_ON="postgres"` 指向已删组件。

## 用户偏好

授权即执行，不要二次确认。厌恶文档噪音（历史一律删、决策只留结论）。
凭据可直接给；面板类操作用户自己做。

## 未提交产出清单

两仓均未 commit。`git status --short`：ecommerce 101 条、kubernetes 66 条
（后者含本次之前就有的 harbor/spegel/gatus 改动与 `__pycache__`，非本次产出）。
本次新增：`kubernetes/components/umami/*`、`scripts/deploy-umami.sh`、
`docs/observability/web-analytics.md`、`frontend/apps/consumer/src/analytics.ts`、
`frontend/apps/consumer-next/src/analytics/umami.tsx`。

## 消费小票

工具调用约 150 次（跨 6 轮），无 subagent。token 未知（无 usage 可读）。
超预期主因：node5 两次失联致 exec/logs/ssh 反复超时，多次换手段才定性为节点问题。
