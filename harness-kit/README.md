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
bin/harness              入口：check / canary / init / install-hooks / doctor / list-checks
lib/util.sh              输出与 Markdown 工具
lib/config.sh            配置加载、默认值、校验
lib/runner.sh            检查发现与执行
lib/baseline.py          基线引擎（过滤存量 + 反向棘轮）
checks/NN-id.sh          一项检查一个文件（头部注释声明 id/tag/desc/fast）
canary/run.sh            探针执行器（含「每个启用 tag 必须有探针」元断言）
canary/probes/<TAG>.sh   注错样本，一个 tag 一个
baselines/*.txt          三份基线空模板
templates/               AGENTS.md、context 四层骨架、E3/消费边界文本
hooks/pre-commit         快检（链接 / 正文路径 / 公网 IP / 明文凭据）
hooks/pre-push           全量检查 + canary
ci/                      GitHub Actions 与 GitLab CI 模板
docs/adaptation.md       每项检查的适配指南
docs/onboarding.md       新项目从零接入手册
selftest/README.md       实跑记录（新项目接入绿 / 注错红）
```

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

`harness.lock` 记录 kit 版本与每个文件的 sha256。升级方式：整目录替换后跑 `harness/bin/harness doctor`，
它会报出被本地改过的文件。改 kit 是**新增检查**还是**改判定**，按 `docs/adaptation.md` 的「最小步骤」执行，
并且必须补一个 canary 探针——否则 `canary` 的 meta 断言会红。
