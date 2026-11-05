# Jev 与仓库审计结果

> 更新：2026-09-27
> 
> 本文件是本轮 Jev 接入、线上只读观测和文档审计的工作结果。它不是运行态真相源；当前环境须按 `context/team/local-env.md` 现查，服务拓扑须查 `.service-matrix.yaml`，进度须查 `TODO.md`。

## 1. Jev 状态

- DSH GUI 已在图片模型控件和文字模型控件之间加入 Jev 控件。
- 本地 Web profile 默认启用 Jev；设置通过 `~/.dsh/settings.yaml` 保存，凭据只通过本地凭据设施中的 `TYPESAFE_API_KEY` 引用。
- 当前 GUI 已通过 Playwright 验证：控件存在、位于模型控件之间，可切换 `Auto → Off → Auto`，320/768/1024/1440 宽度均不溢出。
- 真实 TypeSafe 请求使用虚构排版数据，返回 `jev-1.13.0`、选择 `Table`、confidence `0.97`。
- Jev 只处理显式 `decision_context` 的普通单选题。权限、缺失事实、计划批准、不可逆操作、多选和带 presentation intent 的问题不自动处理。
- 机器答案带 `provider/model/confidence` 来源，永远不等同于人工授权；低置信度、超时、错误响应和取消会转回人工或直接取消。

### 调用方式

#### DSH 提问工具

普通、有充分依据的单选题加入 `decision_context`：

```json
{
  "questions": [
    {
      "id": "format",
      "question": "Which format best compares the objects?",
      "decision_context": "Three fictional objects have five shared attributes. Only presentation changes; no operation is authorized.",
      "options": [
        { "label": "Table", "description": "One row per object and one column per attribute." },
        { "label": "Paragraph", "description": "Unstructured continuous text." }
      ]
    }
  ]
}
```

这份参数交给 `ask_user_question`。启用且满足条件时，DSH 会先调用 Jev；否则走原有人工提问流程。

不要给权限确认、缺失信息、计划审阅或不可逆操作添加 `decision_context`。

#### 直接调用 TypeSafe API

凭据从环境或本地安全存储提供，不要把真实 key 写进命令历史、仓库或文档：

```bash
export TYPESAFE_API_KEY='使用本地安全方式注入，不要写入仓库'

curl --fail-with-body --no-progress-meter \
  -X POST 'https://api.typesafe.ai/v1/systemone' \
  -H "Authorization: Bearer ${TYPESAFE_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "state": "Three fictional objects have five shared attributes.",
    "model": "jev-latest",
    "questions": {
      "format": {
        "type": "choice",
        "instructions": "Which format best compares the objects?",
        "criteria": {
          "table": "One row per object and one column per attribute.",
          "paragraph": "Unstructured continuous text."
        }
      }
    }
  }'
```

官方接口：`https://docs.typesafe.ai/api`。Choice 响应重点读取 `answers.<id>.choice`、`probabilities` 和 `confidence`。生产代码还会加入人工 abstention 选项，并校验完整响应。

## 2. 只读环境观测

最近一次只读查询的目标和结果：

- `node0`：x86_64，Docker 29.8.0；`blog`、`newt` 运行。
- `node1`：x86_64，Docker 29.5.3；Pangolin、Traefik、Casdoor、PostgreSQL、Redis、ntfy 等运行。
- `node2`：x86_64，Docker 29.5.2；Gorse、Silo 运行。
- `k1/k2/k3`：amd64、Ubuntu 26.04.1、kubelet v1.36.4，均 Ready，未报告 Memory/Disk/PID Pressure。
- `ecommerce` namespace：本次查询中的 Deployment 均为 desired=ready。
- ArgoCD：本次只读查询观察到 `ecommerce-kyverno` 为 `Synced`、`Healthy`、automated；没有据此推断业务服务已完成 GitOps 接管。

这些是点时证据，不是容量、持续健康、协议、权限、备份或恢复验收。

## 3. Repowise 结果

使用仓库锁定的 Repowise `0.52.0`，运行了无 LLM、无遥测、无 editor/hook 写入的 fast 审计：

- 索引文件：1,303
- 提取符号：3,156
- unreachable 文件：55
- unused exports：109
- health findings：886
- 高置信度文档 drift：0

unreachable、unused export 和 health findings 只是清理线索，未据此直接删除代码。删除文档前要求同时满足：源码/运行证据确认过期、无仍需保留的决策价值、入站引用已清理。

## 4. 文档处理

已删除：

- `docs/architecture/ecommerce-gateway.html`
- `docs/architecture/ecommerce-gateway.architecture.json`
- `docs/design/payment/payment.md`
- `docs/design/product/schema.md`
- `infrastructure/gatus/README.md`

已重写或校正：

- `README.md`、`README.zh-CN.md`
- `TODO.md`
- `STACK.md`
- `docs/TECH.md`
- `docs/DEVOPS.md`
- `docs/SECURITY-HARDENING.md`
- `docs/observability/grafana/README.md`
- `infrastructure/argocd/README.md`
- `infrastructure/ces-audit/README.md`
- `infrastructure/observability/README.md`
- `infrastructure/tetragon/README.md`
- `infrastructure/host-watchdog/README.md`

保留：

- `docs/TECH-RADAR.md`：历史选型记录，顶部明确以 `docs/TECH.md` 为现行真相源。
- `docs/SCAFFOLD.md`：新项目模板，不承载本仓进度。
- `docs/learning/`：教学和源码演进材料，不作为运行态或进度真相源。
- `docs/design/cart/api-decisions.md`：仍有当前条目 ID 决策价值的论证记录。

## 5. 验证命令

```bash
scripts/verify-context.sh
python3 scripts/verify-doc-sync.py
python3 scripts/doc-embed.py --check
python3 scripts/env-check.py --check
PATH="$PWD/tools/repowise/.venv/bin:$PATH" bash scripts/verify-repowise.sh
git diff --check
```

上述命令在本轮均通过。DSH 侧 Jev focused tests、Loader composition、TypeScript、Client/catalog 和 Agent Note 门禁也通过；完整 GUI 仍有 3 项与 Jev 无关的 `ui-digest` 键盘测试失败。

## 6. 未完成与边界

- Repowise 的 55 个 unreachable、109 个 unused exports 和 886 个 health findings 未直接转化为代码删除。
- `TECH-RADAR.md` 的历史段落仍需人工判断是否继续拆分；它目前已明确标注为历史记录。
- 完整 GUI 的既有 `ui-digest` 测试失败不属于 Jev 变更范围。
- 本轮没有部署、重启生产、修改线上配置、删除线上资源、commit 或 push。
