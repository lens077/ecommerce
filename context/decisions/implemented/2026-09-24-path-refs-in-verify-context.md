---
name: 2026-09-24-path-refs-in-verify-context
layer: decisions
status: implemented
description: 文档路径检查搬进 verify-context 的 [PATH-REF]，Repowise 撤出 CI 改按需审计；运行时配置漂移由 config-seed -drift 对照 matrix 检查
---
# 决策：路径检查回到 verify-context，Repowise 改按需审计，补运行时配置漂移审计

## 问题

[2026-09-22-repowise-gate.md](2026-09-22-repowise-gate.md) 把 Repowise 接成了 GitHub 与 GitLab 的 per-push 门禁。两天后回看它的实际产出与成本：

- 首轮 50 条发现里 47 条是「文档正文里用反引号写的路径已经不存在」，1 条是锚点失效。`verify-context.sh` 的 `[DEAD-LINK]` 只查 Markdown 链接，所以这 47 条一直是绿的。这是真盲区，但判定本身只需要几十行。
- 为这一项判定，门禁要装约 130 个 Python 依赖，工具处于 Alpha、一个月发 12 个小版本；要用 shim 屏蔽未使用的 COBOL grammar 下载；每次 push 都重建索引，而且在两边 CI 上从未真正跑通过。
- 2026-09-23 真正咬人的漂移是运行时配置：Config Center `product/dev` 的 gorse 地址还是旧的公网直连端口（node2 早已只绑回环），key 为空。`.service-matrix.yaml` 的 product 条目**早就写着**这条漂移，但它只是一段备注，不会让任何检查变红。Repowise 读不到 Config Center，看不到这一类。

## 决策

1. **`[PATH-REF]`**：`scripts/path-refs.py` 抽出正文（去掉代码围栏）里反引号内、以仓库根目录开头的路径，不在 git 索引里即违规（按索引而不是按磁盘，本机与 CI 才会给出同一结论；首版按磁盘判，干净 worktree 验证时被本机生成的 `frontend/.vite-hooks/_` 抓出本机绿、CI 红，已加进 `.gitignore`）。豁免：gitignore 覆盖的本机文件、同一行写明已删除/已退役/不再有的历史陈述、「X 仓 / 原」修饰的同级仓或旧位置、`包.符号` 写法。`verify-context.sh` 调用它；立规时的存量 30 条冻结在 `scripts/context-pathref-baseline.txt`，反向棘轮。canary 新增一个红探针、两个假阳性守卫、一个基线棘轮探针。
2. **Repowise 撤出 CI**：删除 `.github/workflows/context-gate.yml` 与 `.gitlab-ci.yml` 里的 `repowise-gate` job，AGENTS.md 锚点里去掉它。`tools/repowise/`、`scripts/verify-repowise.sh` 保留，作为建索引的入口，供死代码、健康、调用图等按需审计使用，见 [repowise.md](../../team/repowise.md)。
3. **运行时配置漂移审计**：`backend/tools/config-seed -drift` 用每个服务自己的 selector 读取 Config Center 的 Bootstrap，把 PostgreSQL、Redis、gorse、Elasticsearch、Casdoor、Consul 的端点与 `.service-matrix.yaml` `externals.<x>.host` / `remote_dev` 比对，并检查启用了的 gorse `api_key` 是否为空、端点是否写成 IP 字面量。只输出路径、主机与判定，不输出任何配置值。CI 没有读配置的权限（`TODO.md`「CI 校验远端 Bootstrap」），先作为本地命令。
4. `.service-matrix.yaml` 删除 product 条目里已过时的 gorse 漂移备注，`externals` 增加结构化的 `remote_dev` 字段供第 3 项比对。

## 考虑过的替代方案

- **保留 Repowise per-push 门禁** — 它能发现的「路径不存在」用几十行脚本就能覆盖；独有能力（死代码、健康、调用图）的误报率高（2026-09-23 那轮 52 个「不可达文件」只有 6 个属实），不适合做阻断门禁，却要为此背一整套依赖和下载 shim。
- **只把路径检查加进 verify-context，不做配置审计** — 那样今天的事故仍然无法被任何检查发现：漂移已经写在真相源里，缺的是能变红的比对。
- **在 structcheck 里比对 Config Center** — structcheck 在 CI 里跑，CI 拿不到 Config Center 的读凭据；放进去要么常年 skip（恒绿假门禁），要么把凭据引进 CI。先做本地命令，等 CI 有受限读取能力再接线。
- **让配置审计直接比对 `externals.host`** — dev 环境走 Pangolin 暴露的域名（如 `pg-dev.apikv.com:30001`），与集群内地址不同，直接比对会让每个服务都报漂移。故新增显式的 `remote_dev` 字段，而不是放宽比对规则。

## 后果

- `verify-context.sh` 多一项检查，耗时增加约 0.1 秒；canary 多 4 个探针。存量 30 条（主要是已删除的 `docs/todo/`、`docs/reports/`、`docs/progress-archive/` 与不存在的 `backend/pkg/testutil`）登记在基线里，清债归 `TODO.md`「清除过期引用与平行状态表」。
- CI 不再安装 Repowise；它的锁文件仍需在版本升级时维护。
- 配置审计是本地命令，不是门禁：它能在改配置或排障时当场指出漂移，但不会自动拦住谁。`matrix` 的 `remote_dev` 成了新的需要维护的事实，改 Pangolin 入口时要同步。
- 由 `scripts/verify-context-canary.sh` 的 `path-ref*` 探针与 `backend/tools/config-seed` 的单元测试钉住行为。
