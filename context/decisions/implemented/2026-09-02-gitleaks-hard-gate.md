---
name: 2026-09-02-gitleaks-hard-gate
layer: decisions
status: implemented
description: 凭据门禁是 commit 路径上的硬门禁：gitleaks 接进 pre-commit / verify-quick / 两远端 CI，工具缺失即红，CI 必须全历史扫描并断言扫描范围
---
# 决策：凭据泄露只能靠 commit 路径上的硬门禁兜

## 问题

`github.com/lens077/ecommerce` 是 public 仓。原有的 `scripts/verify-secrets.py` 是"手动跑才执行"的软探针，只扫配置后缀、
只认 `key: value` 形态；`TODO.md` 里的散文、`sqlc.yaml` 的 `uri: postgresql://user:pass@`、`req.http` 里的 JWT、
Consul KV 快照里 base64 的整份配置全在盲区。凭据一旦 push 到 public 仓就不可撤回，靠"记得跑 verify-quick"拦不住。
事故经过与三轮历史重写见 [evolution-log 2026-09-02](../../harness-framework/evolution-log.md)。

## 决策

规则在仓库根 `.gitleaks.toml`：默认规则 + 两条自定义（`url-embedded-credential` 抓 `scheme://user:pass@host`；
`config-password-assignment` 抓配置/文档里的短弱口令赋值——默认 `generic-api-key` 靠熵值，6 位弱口令漏掉）。
allowlist 只放核实过的公开默认值 / 占位符 / 合成样本，每条写明是什么；靠大小写区分的条目必须显式 `(?-i)`，
因为 gitleaks 把同组 regex 拼成一条，前面的 `(?i)` 会漏到后面。

三处接线，缺一处就是盲区：

- `frontend/.vite-hooks/pre-commit`：`gitleaks git --pre-commit --staged`，先于 `vp staged`；
  **工具缺失直接红**，绕过口令 `SKIP_GITLEAKS=1`（须在提交信息里说明）。
- `scripts/verify-quick.sh` 的 secrets 通道：`verify-secrets.py` 之后追加 gitleaks 全历史扫描。
- GitHub `context-gate.yml` 与 `.gitlab-ci.yml` 各一个 `gitleaks` job：钉版本 + sha256 校验的二进制直跑，
  两边命令逐字相同；`fetch-depth` / `GIT_DEPTH` 必须为 0，并**断言 `N commits scanned` > 100**——
  浅克隆或只扫本次推送都等于没扫。

## 考虑过的替代方案

- **保留 `verify-secrets.py` 软探针，加强规则** — 它的失败方式是"没人跑"，规则再强也只在被调用时生效；
  事故本身就是它存在期间发生的。
- **工具缺失时跳过（降级放行）** — 一道"没装就静默放行"的门禁等于没有：`verify-freeze.sh` 恒绿十七天、
  commitlint 静默九个月，两次同构事故已经证明（self-refinement 教训存档）。
- **CI 用 `gitleaks-action@v2`** — 首跑 7 秒绿，日志显示 `--log-opts=-1` / `1 commits scanned`：它在 push 事件上
  只扫本次推送的提交，`fetch-depth: 0` 白拉，又是一道恒绿的假门禁。换成二进制直跑并断言扫描范围。
- **只在 CI 扫，不进 pre-commit** — push 到 public 远端的那一刻泄露就已发生，CI 红只是事后通知；
  必须在 commit 进入本地历史前拦。

## 后果

- 每次 commit 多一次暂存区扫描（秒级）；本机必须装 gitleaks（`brew install gitleaks`），否则提交被拒。
- allowlist 修正类的提交需要 `SKIP_GITLEAKS=1`，是有意的摩擦。
- 门禁首跑必须读日志确认扫描范围，不能只看绿——这条已写进 `.gitlab-ci.yml` / `context-gate.yml` 的断言。
- 钉住行为的验证：canary 暂存 `password: <6 位弱口令>` + `postgresql://app:Sup3rS3cret@` 报 2 条红，
  `${DB_PASSWORD}` / `postgres:postgres@localhost` 绿；CI 本地正向 705 提交通过、`--depth 1` 克隆下断言按预期红；
  独立脚本对 5933 个历史 blob 做明文 + base64 解码扫描，已知秘密串零命中。
- 未完成项（不属于本决策，记在日志里）：轮换全部泄露凭据；向 GitHub Support 申请悬空对象清理。
