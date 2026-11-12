# harness-kit

一套**可移植**的 Agent 门禁（harness）资产：参数化检查脚本、基线引擎、canary 探针执行器、hook 安装器、CI 模板、文档骨架。

设计约束：

- **零第三方依赖**：bash + Python 标准库，不需要 yq / jq / node；离线可跑。
- **配置是 bash**，不是 YAML：省掉一个解析器，代价是配置可执行——只放自己的仓库里，不要执行来路不明的配置。
- **检查是独立文件**：`checks/NN-id.sh` 一个文件一项检查，新增/删除一项只增删一个文件 + 一个探针。
- **不含任何业务事实**：服务名、端口、集群地址、订单/库存术语、预算数值都不在 kit 里，全部走配置或模板占位符。
- **不改宿主仓库的既有门禁**：kit 是新代码，宿主原有的 `verify-*.sh` 保持行为不变。

## 目录

```
bin/harness              入口：check / canary / init / install-hooks / doctor / lock / list-checks
lib/util.sh              输出与 Markdown 工具
lib/config.sh            配置加载、默认值、校验
lib/runner.sh            检查发现与执行（kit + 宿主适配层）
lib/baseline.py          基线引擎（过滤存量 + 反向棘轮）
checks/NN-id.sh          一项检查一个文件（头部注释声明 id/tag/desc/fast/config）
canary/run.sh            探针执行器（含「每个启用 tag 必须有探针」等元断言）
canary/probes/<TAG>.sh   注错样本，一个 tag 一个
canary/positives/<TAG>.sh 正样本，证明新判定不误杀
baselines/*.txt          三份基线空模板
templates/               AGENTS.md、context 四层骨架、E3/消费边界文本
hooks/pre-commit         快检（链接 / 正文路径 / 公网 IP / 明文凭据）
hooks/pre-push           全量检查 + canary
ci/                      GitHub Actions 与 GitLab CI 模板
docs/adaptation.md       每项检查的适配指南
docs/onboarding.md       新项目从零接入手册
selftest/README.md       实跑记录（新项目接入绿 / 注错红）
```

## 检查清单（16 项）

| id | tag | 验什么 |
| --- | --- | --- |
| `dead-link` | DEAD-LINK | Markdown 相对链接目标存在且未被 gitignore |
| `path-ref` | PATH-REF | 正文反引号里的仓库路径存在 |
| `frontmatter` | FRONTMATTER | context 文档的 name/layer/module 与路径一致 |
| `affects` | AFFECTS | frontmatter 的 `affects:` 真实存在、不含 glob |
| `index-coverage` | ORPHAN | 每篇 context 文档都被 INDEX 收录（含嵌套层逐级登记） |
| `index-line` | INDEX-LINE | INDEX 表格单元不超字数上限 |
| `format` | FORMAT | 经验文档含约定小节 |
| `evidence` | EVIDENCE | 经验文档「证据」段每条带来源标签 |
| `budget` | BUDGET | 入口文档按文件不超字节上限 |
| `retired` | RETIRED | 提到已退役组件时写明它已退役 |
| `skill-ref` | SKILL-REF | 入口文档不要求执行登记为不可用的 skill |
| `progress-source` | PROGRESS-SRC | 复选框只长在唯一进度源（按计数冻结存量） |
| `doc-sync` | DOC-SYNC | 责任文档与它 affects 的改动同批提交 |
| `selfcheck` | SELFCHECK | 实现单标 done 时有完成自检且带证据 |
| `public-ip` | PUBLIC-IP | 跟踪文件里没有公网 IP |
| `secrets` | SECRETS | 内置明文特征 + gitleaks 历史扫描 |

仓库专属判定不进 `checks/`：放宿主仓库的适配层目录，`HARNESS_EXTRA_CHECKS_DIR` 指向它，
协议与核心检查相同。

## 最小用法

```bash
cp -R harness-kit <your-repo>/harness
cd <your-repo>
harness/bin/harness init            # 生成 harness.config.sh、context 骨架、基线、harness.lock
harness/bin/harness doctor          # 配置与工具自检
harness/bin/harness check           # 应绿
harness/bin/harness canary          # 证明门禁真的会红
harness/bin/harness install-hooks   # core.hooksPath -> harness/hooks
```

完整步骤见 [docs/onboarding.md](docs/onboarding.md)，每项检查改什么见 [docs/adaptation.md](docs/adaptation.md)。

## 版本与升级

当前版本 **0.3.0**（回流五个接入仓的本地补丁，见下方「0.3.0 变更」）。

`harness.lock` 记录 kit 版本与每个文件的 sha256。升级方式：整目录替换后跑
`harness/bin/harness lock` 重写 lock，再跑 `harness/bin/harness doctor`，它会报出被本地改过的文件。
改 kit 是**新增检查**还是**改判定**，按 `docs/adaptation.md` 的「最小步骤」执行，
并且必须补一个 canary 探针——否则 `canary` 的 meta 断言会红。

### 0.3.0 变更（五仓接入补丁回流）

| 修补 | 来源 | 落点 |
| --- | --- | --- |
| PATH-REF 支持 `path:line`、跳过任意位置的 `*`（修 `e2e/*.spec.ts` 误报） | ToDo、LyraPass | `checks/20-path-ref.sh` + canary 自检 |
| 探测 `REPO_ROOT` 前清 `GIT_DIR`（hook 里会把 `harness/` 当工作树根，阻断所有提交） | Libra | `lib/config.sh`、`hooks/pre-commit` |
| 沙箱镜像已跟踪文件树（文档引用扫描根外源码时干净模板不再必红） | Libra | `canary/run.sh` |
| 沙箱复制 `.gitleaks.toml` | palcommerce、Libra | `canary/run.sh` |
| 子目录单文件扫描根先建父目录 | Libra | `canary/run.sh` |
| SECRETS 支持豁免清单 `HARNESS_SECRETS_ALLOW` | Scorpius | `checks/95-secrets.sh` |
| canary 支持仓库外资源 `HARNESS_CANARY_EXTERNAL` | Scorpius | `canary/run.sh` |
| SKILL-REF 探针读配置而非硬编码路径 | Scorpius | `canary/probes/SKILL-REF.sh` |
| 每项补「修前红、修后绿」的自检/用例 | 本轮 | `canary/run.sh` 的 selfcheck 段 |

升级到 0.3.0：替换 `harness/` 整目录 → `harness/bin/harness doctor` → `harness/bin/harness lock`
→ `harness/bin/harness check` → `harness/bin/harness canary`。若文档引用同级仓资源，
确认 `HARNESS_CANARY_EXTERNAL` 已填；扫描根是子目录单文件（如 `docs/README.md`）时
0.3.0 已自动建父目录，无需额外配置。<br>
只把接入期临时打的补丁删掉再升级——不要保留「本地改过的 kit」，`doctor` 会一直报 drift。

## 默认配置的两个要点

- `HARNESS_GITLEAKS` 默认 `required`（fail-closed）。没装 gitleaks 就红是**预期行为**，
  安装入口见 <https://github.com/gitleaks/gitleaks#installing>；确实装不了时显式写
  `HARNESS_GITLEAKS="optional"`，不要写 `off`。
- 可选检查（FORMAT / EVIDENCE / RETIRED / INDEX-LINE / SELFCHECK）留空即关闭；
  它们没有默认词表，词表属于宿主仓库的业务事实。
