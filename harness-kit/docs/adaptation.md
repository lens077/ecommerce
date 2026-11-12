# 适配指南：每项检查在验什么、怎么改

面向要接 kit 的项目的维护者。每项检查按同一模板写：
**验什么 / 依赖哪些配置 / 失败意味着什么 / 怎么放宽或替换 / 补探针 / 常见误配**。

先记住三条总原则：

1. **放宽要留痕**：优先登记基线（存量），不要改小判定范围。基线是「欠债清单」，判定范围是「合同」。
2. **豁免只放不收 = 慢性失效**：基线有反向棘轮（`stale` 检查），修好后必须删行，否则 `BASELINE` 会红。
3. **扫描范围不同会造成假红**：`DEAD-LINK` 扫工作区磁盘，`PUBLIC-IP`/`SECRETS` 扫 git 索引/工作区跟踪文件。
   一个「本机存在但没入库」的文件，前者看不见问题、后者看不见文件，结论不同不是 bug。

---

## DEAD-LINK — 相对链接可达

- **验什么**：`HARNESS_DOC_ROOTS` 下 Markdown 的相对链接目标存在，且未被 `.gitignore` 忽略。
- **配置**：`HARNESS_DOC_ROOTS`。
- **失败意味着**：文档承诺了一个不存在的文件；或目标只在本机存在（fresh clone 会断）。
- **放宽/替换**：`harness.config.sh` 里收窄 `HARNESS_DOC_ROOTS`；或删掉链接改成纯文本。
  不要为了让链接过而把文件加进仓库（那会让「本机私有草稿」变成公开契约）。
- **探针**：`canary/probes/DEAD-LINK.sh` 往入口文档追加一行坏链。
- **常见误配**：围栏里的示例链接被误报——kit 会剥掉 ``` 围栏，`~~~` 围栏不剥（统一成 ```）。

## PATH-REF — 正文反引号里的仓库路径

- **验什么**：`` `context/foo.md` `` 这类以真实顶层目录开头的路径必须存在。
  只认真实存在的顶层目录，命令名、口号、URL 不判定。
  `` `path/to/file.md:12` `` / `:12-34` / 逗号多段 `:12-34,56-78` 会剥掉行号再判存在；
  含 `*` 的通配（任意位置，如 `e2e/*.spec.ts`）视为模式，不判存在性。
- **配置**：`HARNESS_DOC_ROOTS`；存量走 `HARNESS_PATHREF_BASELINE`（默认 `baselines/pathref.baseline.txt`）。
- **失败意味着**：文档让人去改一个不存在的文件——比死链更隐蔽，因为不是链接。
- **放宽/替换**：先删基线行；确实不能立刻修的，登记 `<文件>\t<路径>` 进基线。
- **探针 / 自检**：`PATH-REF.sh` 追加 `` `context/no-such-canary.md` ``；
  `canary/run.sh` 的 `path-ref-patterns` 自检证明 `path:line` 与中段 `*` 放行、真缺失仍红；
  `path-ref-line-forms` 自检覆盖单行、区间、逗号多段、逗号混合四种行号形态，并确认中段/结尾 `*` 仍跳过；
  `path-ref-fork-count` 自检在 1200 个 token 的样本上统计外部进程调用次数（0.3.2 新增）。
- **性能**：剥行号必须与 token 数无关。0.3.1 及之前每个 token 起一次 `sed`，
  LyraPass（125 个 md、11,005 个 token）这一项 39.5s，`sys` 远大于 `user`，是 fork 放大；
  0.3.2 把剥反引号与剥行号合并进同一条 `sed`（每个文件一次），实测 LyraPass 46.36s → 1.07–1.45s、
  ecommerce 40.07s → 1.75s、2000-token 合成样本 7.41–7.60s → 0.24–0.26s。
  `path-ref-fork-count` 用 PATH 垫片统计 `sed`/`awk` 调用次数而不是墙钟：1200 个 token 实测 11 次，
  上限 32；旧实现是 1211 次。计数值只与文件数有关、与机器快慢无关，不会在慢 CI 上假红。
- **常见误配**：把 glob 当路径判定——kit 跳过含 `* ? < > { } [ ]` 等占位符的 token；
  旧版只跳过「以 `*` 结尾」的 token，`e2e/*.spec.ts` 会误报（0.3.0 修）。
  行号只剥单段时，逗号多段的引用会整串当文件名误报（0.3.1 修，ToDo、palcommerce 撞到）。
  把行号剥离写回 `while read` 循环里会重新引入逐 token fork（0.3.2 修，LyraPass 报告）。
  含空格的整段被跳过，长句里的路径请在反引号里只写路径本身。

## FRONTMATTER — 文档元数据

- **验什么**：`context/**` 下非 INDEX 的文档首行是 `---`；`name` 等于文件名、`layer` 等于所在目录、
  `description` 非空；`HARNESS_NESTED_LAYER` 下的文档 `module` 必须与模块目录一致。
  （`affects:` 的存在性由 AFFECTS 检查负责。）
- **配置**：`HARNESS_LAYERS`（层目录名）、`HARNESS_NESTED_LAYER`。
- **失败意味着**：文档无法被路由（层错）或无法被检索（name 错），属于结构性损坏。
- **放宽/替换**：不要放宽 name==文件名，它会传染——检索、链接、索引都依赖它。
  如需更多必填键，在 `checks/30-frontmatter.sh` 加一行断言并同步探针。
- **探针**：`FRONTMATTER.sh` 写一个 name 与文件名不一致的文档并登记进 INDEX。
- **常见误配**：`layer` 写成绝对路径或大驼峰；嵌套目录（`project/sub/x.md`）的 layer 应是第一段 `project`。

## ORPHAN — 防孤儿

- **验什么**：`context/<layer>` 下每篇文档都被该层 `INDEX.md`（或其他层 INDEX）收录；
  根 `INDEX.md` 链接了每个存在的层 INDEX。`HARNESS_NESTED_LAYER` 指定形如
  `<层>/<项目>/<模块>/` 的层：项目与模块要逐级登记，层 INDEX 不存在时只校验根 INDEX 里的项目条目。
- **配置**：`HARNESS_LAYERS`、`HARNESS_NESTED_LAYER`。
- **失败意味着**：文档存在但没人能找到——等于没写。
- **放宽/替换**：补 INDEX 行，不要改成「允许未登记」。
- **探针**：`ORPHAN.sh` 写一个合规但未登记的文档。
- **常见误配**：INDEX 里只写文件名不写链接——kit 用 `grep -F` 匹配文件名，能过；
  但人类读者点不进去，建议始终写成 `[x.md](x.md)`。

## BUDGET — 入口文档预算

- **验什么**：`HARNESS_BUDGETS` 里每项 `<文件>:<字节数>` 分别校验该文件不超过上限。
- **配置**：`HARNESS_BUDGETS`（空格分隔的 `文件:字节` 列表）。
- **失败意味着**：入口文件开始承载本该下沉到 `context/` 的细节，Agent 的上下文会被挤占。
- **放宽/替换**：先删重复内容或下沉到 `context/`；确需提高预算时在决策记录里写清理由。
  **不要**把预算调大作为修法。
- **探针**：`BUDGET.sh` 把首个预算文件的字节数推过上限。
- **常见误配**：预算单位搞错（是字节不是字符，中文 3 字节）；`文件:字节` 写成空格分隔；
  列表里登记了不存在的文件（`doctor` 会报）。

## SKILL-REF — skill 采用状态契约

- **验什么**：`HARNESS_SKILL_DOC` 的 `## <HARNESS_SKILL_SECTION>` 表格里，
  第 1 列 skill 名、第 2 列状态；状态含「缺失 / 不采用 / 未装 / unavailable」的 skill，
  不得以 `` `/名字` `` 的形式出现在 `HARNESS_SKILL_ENTRY_DOCS` 中（围栏外）。
- **配置**：`HARNESS_SKILL_DOC`、`HARNESS_SKILL_SECTION`、`HARNESS_SKILL_ENTRY_DOCS`。
- **失败意味着**：入口文件要求执行一个明确不可用的 skill，Agent 会卡住或瞎试。
- **放宽/替换**：改状态列而**不是**改列位；列位是契约，挪列会让检查静默读错。
  新增状态词时同步 `checks/60-skill-ref.sh` 的正则。
- **探针**：`SKILL-REF.sh` 加一行「缺失」的 skill 并在入口文档提及它。
- **常见误配**：把「已安装 / 缺失」这类运行态写进表——会天天过期，kit 的语义是「采用 / 不采用」。

## PROGRESS-SRC — 进度源唯一

- **验什么**：`HARNESS_PROGRESS_SCOPE=repo` 时扫全仓 `*.md`（否则只扫 `HARNESS_DOC_ROOTS`），
  除 `HARNESS_PROGRESS_FILE` 与 `HARNESS_PROGRESS_ALLOW` 命中的目录外，不得出现
  `- [ ]` / `- [x]`（剥掉围栏后）。
- **配置**：`HARNESS_PROGRESS_FILE`、`HARNESS_PROGRESS_SCOPE`、`HARNESS_PROGRESS_ALLOW`；
  存量走 `HARNESS_PROGRESS_BASELINE`，每行 `<文件> <计数>`。
- **失败意味着**：出现第二份进度真相源，两边会不一致。
- **放宽/替换**：把示例放进 ``` 围栏（围栏内不算）；存量按**计数**冻结（只许减不许增），
  并逐步清理。
- **探针**：`PROGRESS-SRC.sh` 往任意被扫描文档追加一个复选框。
- **常见误配**：把「验收清单」写在交付文档里——它们确实是待办，应进 `TODO.md` 或被围栏包起来；
  基线写成 `<文件>`（缺计数）——计数基线才能挡住「已登记文件继续长复选框」。

## DOC-SYNC — 文档责任

- **验什么**：frontmatter 写 `doc-sync: required` 且 `affects:` 覆盖的路径有改动时，
  这份文档必须出现在同一批改动里。
- **配置**：`HARNESS_DOC_SYNC`、`HARNESS_BASE_REF`（CI 里给 base ref），
  或用环境变量 `HARNESS_CHANGED_FILES` 传改动清单。
- **失败意味着**：代码改了、责任文档没动。kit 只证明「一起改过」，不证明语义一致。
- **放宽/替换**：缩小 `affects:` 的粒度（指向具体文件而非整个目录），不要关掉检查。
- **探针**：`DOC-SYNC.sh` 造一份要求文档 + 只改它 affects 的路径。
- **常见误配**：`affects:` 写目录却期望「只看文件」；在非 git 环境跑导致改动来源为空而静默通过
  （此时输出 `无改动来源，跳过`，CI 里必须给 base ref）。

## PUBLIC-IP — 公网 IP

- **验什么**：git 跟踪文件里的 IP 字面量，剔除私网、回环、链路本地与保留段后不得为公网。
- **配置**：`HARNESS_IP_ALLOWLIST`（每行一个 IP 或 `前缀.`）。
- **失败意味着**：内网拓扑或调试地址进了仓库，属于信息泄露。
- **放宽/替换**：把确实需要公开的例子放进 allowlist 文件并写明理由；**不要**改成只扫 diff。
- **探针**：`PUBLIC-IP.sh` 在运行时拼出一个公网地址写进文档（kit 自身不带字面量）。
- **常见误配**：把文档专用段当公网（不同 Python 版本对 `is_global` 的判断不同，kit 用 `is_global`）；
  二进制文件被 `-I` 跳过，属预期。

## SECRETS — 明文凭据

- **验什么**：内置特征（私钥头、云厂商 AK、`password = "..."` 一类赋值）零依赖扫描；
  `HARNESS_GITLEAKS=optional|required` 时再叠 gitleaks 历史扫描。
- **配置**：`HARNESS_GITLEAKS`，默认 `required`（fail-closed）；
  内置特征的路径豁免走 `HARNESS_SECRETS_ALLOW`（空格分隔的仓库相对 glob，如 `fixtures/*`）。
- **失败意味着**：凭据已进提交树。**改历史**比改当前文件重要——kit 只负责拦新增。
- **放宽/替换**：给 gitleaks 配 `.gitleaks.toml` 的 allowlist（覆盖历史扫描）；
  内置特征命中优先改代码。只有测试夹具/示例确实需要假值时，才用 `HARNESS_SECRETS_ALLOW`
  按路径豁免——它不影响 gitleaks，范围比 `.gitleaks.toml` 小。
- **探针 / 自检**：`SECRETS.sh` 在运行时拼出关键字与值，避免探针源码自己命中；
  `canary/run.sh` 的 `secrets-allowlist` 自检证明豁免生效、去掉豁免即红。
- **常见误配**：`required` 模式下机器没装 gitleaks → 直接红，**这是预期的接入动作**：
  按 <https://github.com/gitleaks/gitleaks#installing> 装好再跑 `doctor`。
  确实装不了时显式写 `HARNESS_GITLEAKS="optional"`（doctor 会提示降级），不要写 `off`。

## AFFECTS — frontmatter 的反向依赖索引

- **验什么**：`HARNESS_AFFECTS_ROOTS` 下文档的 `affects:` 每一项必须非空、真实存在、不含 glob。
- **配置**：`HARNESS_AFFECTS_ROOTS`（空格分隔的目录列表）。
- **失败意味着**：索引指向已删路径，会让人以为核对过了——比没有索引更危险。
- **放宽/替换**：改路径或删条目；不要加 glob，存在性就没法判定了。
- **探针**：`AFFECTS.sh` 把一条 `affects:` 指到不存在的目录。
- **常见误配**：`affects:` 写成列表外的行内数组（`[a, b]`）——kit 只读 `- path` 块列表；
  指向目录时别带尾随 `/**`。

## INDEX-LINE — INDEX 单元格长度

- **验什么**：`HARNESS_INDEX_LINE_LIMITS` 里每项 `<glob>:<字数>`，命中的 INDEX 表格单元
  超出字数上限即红；按 Unicode 字符计数（中文 1 字）。
- **配置**：`HARNESS_INDEX_LINE_LIMITS`（留空 = 关闭）。
- **失败意味着**：INDEX 从「路由」退化成「内容层」，第一跳就读到细节，第二跳没人点。
- **放宽/替换**：把细节下沉到被索引的文档；不要只对某个文件调大上限。
- **探针 / 正样本**：`INDEX-LINE.sh` 写一个超长单元；`positives/INDEX-LINE.sh` 写一个合规长度。
- **常见误配**：glob 写成目录（`context/**`）而不是 `*/INDEX.md`；把表格分隔行当成数据行。

## FORMAT — 经验文档的固定小节

- **验什么**：`HARNESS_FORMAT_GLOBS` 命中的文档必须含 `HARNESS_FORMAT_SECTIONS` 声明的各组小节；
  分号分组，竖线表示可选写法（`症状;关键陷阱|陷阱`）。
- **配置**：`HARNESS_FORMAT_GLOBS`、`HARNESS_FORMAT_SECTIONS`、`HARNESS_FORMAT_BASELINE`。
- **失败意味着**：经验文档没有固定骨架，检索与复用都靠人读全文。
- **放宽/替换**：存量登记基线（只许收紧）；格式本身要改就改配置，不要删检查。
- **探针 / 正样本**：`FORMAT.sh` 缺一段；`positives/FORMAT.sh` 四段齐全。
- **常见误配**：把「可选小节」写成必填——用户会被迫编内容；glob 忘记按 `find -path` 语义写。

## EVIDENCE — 经验文档的证据来源

- **验什么**：`HARNESS_EVIDENCE_GLOBS` 命中文档的「证据」段里，每条 `- ` 列表项必须以
  `HARNESS_EVIDENCE_LABELS` 中的来源标签开头（`[log]` / `[metric]` / …）；围栏内的行不算。
- **配置**：`HARNESS_EVIDENCE_GLOBS`、`HARNESS_EVIDENCE_SECTION`、`HARNESS_EVIDENCE_LABELS`。
- **失败意味着**：结论没有可追溯来源，下一个人只能重跑一遍或盲信。
- **放宽/替换**：补标签；新增来源类型就加进 `LABELS`，不要用「没标签也算」的开关。
- **探针 / 正样本**：`EVIDENCE.sh` 写一条无标签；`positives/EVIDENCE.sh` 全带标签。
- **常见误配**：把「证据」段之后的其他列表也算进去——kit 到下一个标题为止；标签写成中文全角括号。
- **Linux 注意**：实现里不要用 awk 区间量词 `{m,n}`。Debian/Ubuntu 默认 awk 是 mawk，不支持它，
  `## 证据` 会被整段静默跳过（0.3.2 及之前的缺陷，0.3.3 修）；用 `^##? ` 或 `^#+ ` 这类写法。

## RETIRED — 退役组件必须标明

- **验什么**：`HARNESS_RETIRED_ROOTS` 的正文（围栏外）提到 `HARNESS_RETIRED_TERMS`
  中的组件时，前后 `HARNESS_RETIRED_WINDOW` 行内必须有 `HARNESS_RETIRED_BANNERS` 的横幅词；
  文件前 `HARNESS_RETIRED_HEAD` 行有横幅则整篇放行。
- **配置**：`HARNESS_RETIRED_ROOTS`、`HARNESS_RETIRED_TERMS`（留空 = 关闭）、
  `HARNESS_RETIRED_BANNERS`、`HARNESS_RETIRED_WINDOW`、`HARNESS_RETIRED_HEAD`。
- **失败意味着**：读者会照着已退役的组件去排查，找不到东西还以为是环境问题。
- **放宽/替换**：在同一行或邻近行写明「已退役」，或把整段移到带横幅的历史文档。
- **探针 / 正样本**：`RETIRED.sh` 裸提组件；`positives/RETIRED.sh` 带「已退役」横幅。
- **常见误配**：把词表写成字面量串而不是 ERE（`a|b` 才对）；横幅窗口设成 0（只认同行）。

## SELFCHECK — 实现单的完成自检

- **验什么**：`HARNESS_SELFCHECK_GLOBS` 命中且正文命中 `HARNESS_SELFCHECK_STATUS` 的实现单，
  必须有 `## <HARNESS_SELFCHECK_SECTION>`，且每条复选框带 `HARNESS_SELFCHECK_SEPARATOR`
  之后的证据或原因。
- **配置**：`HARNESS_SELFCHECK_GLOBS`（留空 = 关闭）、`HARNESS_SELFCHECK_STATUS`、
  `HARNESS_SELFCHECK_SECTION`、`HARNESS_SELFCHECK_SEPARATOR`。
- **失败意味着**：「代码写完 = 完成」——最常见的假成功。
- **放宽/替换**：如实写「未验证」并给原因，不要删小节；确实不适用就收窄 glob。
- **探针 / 正样本**：`SELFCHECK.sh` 缺小节；`positives/SELFCHECK.sh` 含带原因的未勾选项。
- **常见误配**：把 `Status: done` 写成大小写混排（按配置的正则）；分隔符用半角 `--`。

---

## canary 的沙箱会复制什么

干净模板必须与宿主仓库的「存在性事实」一致，否则探针测的是残缺树：

- `HARNESS_DOC_ROOTS`：文件或目录都支持；子目录里的单文件（如 `docs/README.md`）
  会先建父目录再复制。
- **已跟踪文件树**：`git ls-files` 的文件按原路径复制，文档引用 `backend/x.go`
  这类扫描根外源码时不会误报。
- `.gitleaks.toml`：有就复制，避免 SECRETS 在沙箱里用默认规则误报已豁免项。
- `HARNESS_CANARY_EXTERNAL`：文档引用的仓库外资源（相对仓库根，如 `../shared/docs`），
  按同样的相对位置铺到沙箱外层，让 `../x` 解析到同一份资源。留空 = 不铺。

新增这类「构建阶段」的修法时，探针（模板之后注错）覆盖不到，要在 `canary/run.sh`
的 selfcheck 段补一条用例；否则下次接入会原样再撞一次。

### 探针沙箱如何复用模板（0.3.1）

模板只构建一次。每个探针的沙箱按三步取最便宜的一种：

1. `cp -cR` 写时复制克隆（APFS/ReFS）：探针天然隔离，本机实测也比逐文件硬链接快；
2. 不支持写时复制时，`cp -al` 从模板整树硬链接（文件数据不复制）；
3. 硬链接也不可用时，退回 `cp -R` 整树复制。

走硬链接时，把「探针会原地写」的路径断开硬链接、换成真拷贝：

- `.git`、`harness.config.sh`、`baselines/`、`.gitleaks.toml`；
- `AGENTS.md`、`context/`、`docs/`（探针固定会写这几处）；
- `HARNESS_DOC_ROOTS` 里的每一项（宿主可能把探针写到的文件配成扫描根）。

因此一次注错只影响自己的沙箱，模板始终是干净基线。`canary/run.sh` 的
`selfcheck probe-isolation` 每次都会验证这一点：往沙箱里的 `AGENTS.md` 追加一行，
断言模板的摘要不变、沙箱确实写进去了；同时报告沙箱用的是写时复制克隆、硬链接还是整树复制。

实测（同一台 macOS / APFS，`/usr/bin/time -p`，全部探针通过）：

| 仓库 | 0.3.0 | 0.3.1 | 说明 |
| --- | --- | --- | --- |
| ecommerce（1794 个已跟踪文件，19 探针） | 384.88s | 145.08s | 沙箱合计 29s，门禁合计 388s（并行 CPU 时间） |
| ToDo（561 个已跟踪文件，23 探针） | 338.51s | 139.35s | 沙箱合计 22s，门禁合计 426s |

两个数字说明两件事：

- **沙箱复制本来就不是主要成本**。APFS 上 0.3.0 的 `cp -cR` 已经是写时复制，
  单个探针的整树克隆约 1s；ToDo 的 5–6 分钟里门禁执行占九成以上。
- **墙钟的大头来自「探针串行」**。0.3.1 在复制复用之外，把探针按 4 个一批并行
  （每个探针仍是独立沙箱、完整跑一遍门禁），断言一条不少，墙钟降到约三分之一。
  各探针的门禁 CPU 时间相加仍是 388s/426s，只是不再排队等待。

文件系统没有写时复制时（Linux ext4、部分容器卷），0.3.0 会退回 `cp -R` 整树复制，
那才是「每个探针复制一遍仓库」的真实成本；0.3.1 的硬链接复用就是为这类环境准备的。
代价：探针并行会同时占用 4 份门禁进程，低配 CI 上内存/CPU 会更高；批大小在
`canary/run.sh` 的 `run_queue` 里固定为 4，需要更保守可改成 2。

---

## CI 模板：PR 只跑 doctor + check

0.3.1 起，`ci/` 下两个平台的模板采用同一策略：

- **PR / MR**：`doctor` + `check`。验证的是「这次改动没破坏仓库事实」。
- **push 到默认分支（main）或打 tag**：`doctor` + `check` + `canary`。
  验证的是「门禁本身还拦得住」。

理由：`canary` 的成本与「探针数 × 仓库体积」正相关，大仓本机 5–6 分钟；
PR 阶段反复跑并不能更早发现问题——探针测的是 kit 的判定，不是这次业务改动。
把 canary 放在合入点，仍能保证 main 上的门禁是被证明过的。

改回全量（每次 PR 都跑 canary）：

- GitHub：删掉 `canary` 步骤的 `if:`，让它无条件执行。
- GitLab：删掉 script 里的 `if` 判断，把 `bash harness/bin/harness canary` 改成无条件一行。

只改模板，不影响已经接入仓库自己的 CI 文件；ecommerce 本仓的 `scripts/verify-context.sh`
行为与这条策略无关，保持原样。

---

## 最小步骤：新增一项检查

1. 建 `checks/NN-id.sh`，头部写 `# id / # tag / # desc`（需要快检就加 `# fast: 1`）。
2. 在文件里 `. "$HARNESS_KIT/lib/util.sh"`，失败调用 `h_fail TAG "说明"`，末尾 `[ "$H_FAILS" -eq 0 ]`。
3. 新增配置项（可选）：写进 `harness.config.example.sh`，并在 `lib/config.sh` 给默认值与 `export`。
4. 写 `canary/probes/TAG.sh`：接收沙箱路径 `$1`，注入一个已知违规。
5. 新增判定类检查还要写 `canary/positives/TAG.sh`：注入一个合规样本，证明不误杀；
   并在 `canary/run.sh` 的 `POSITIVE_TAGS` 里登记。
6. 跑 `harness check`（干净仓库必须仍绿）与 `harness canary`（新 tag 必须红）。
7. 在本文件补一节，写清验什么、怎么放宽、常见误配。

仓库专属判定不要塞进 `checks/`：放进宿主仓库的适配层目录，`HARNESS_EXTRA_CHECKS_DIR`
指向它即可，协议与核心检查相同（同样的 `# id/# tag/# desc` 头部与 `h_fail` 调用）。
适配层检查的探针放在宿主自己的 canary 脚本里——它不随 kit 分发。

## 最小步骤：替换某一项判定

1. 只改 `checks/NN-id.sh` 内部实现，**保持 tag 不变**——tag 是探针与 CI 的历史接口。
2. 若判定语义变了，先改 `canary/probes/TAG.sh` 的注错样本，让它仍然违反新语义。
3. 跑 `harness canary`；如果新实现把旧探针放过了，说明判定被削弱，回到第 1 步。
4. `harness init` 重写 `harness.lock`（init 不覆盖已有文档，只刷新摘要）。

## 基线怎么用

```bash
# 1) 先跑检查，确认红的是「存量」而不是「新违规」
harness/bin/harness check

# 2) 只把确实无法立刻修的存量登记进基线（文件已存在则不覆盖）
python3 harness/lib/baseline.py init \
  --baseline baselines/pathref.baseline.txt \
  --hits /tmp/pathref-hits.txt

# 3) 修好后删除对应行；忘记删会被 stale 检查拦下
```

反模式：一上来就 `init` 全部基线，把「还没修」变成「永远豁免」。
判断标准：这条记录能不能写进 `TODO.md` 并给出修复触发条件；写不出就别登记。
