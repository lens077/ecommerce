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
- **配置**：`HARNESS_DOC_ROOTS`；存量走 `baselines/pathref.baseline.txt`。
- **失败意味着**：文档让人去改一个不存在的文件——比死链更隐蔽，因为不是链接。
- **放宽/替换**：先删基线行；确实不能立刻修的，登记 `<文件>\t<路径>` 进基线。
- **探针**：`PATH-REF.sh` 追加 `` `context/no-such-canary.md` ``。
- **常见误配**：把 glob（`services/*/deploy`）当路径判定——kit 已跳过 `* ? < > { } [ ]` 等占位符；
  含空格的整段被跳过，长句里的路径请在反引号里只写路径本身。

## FRONTMATTER — 文档元数据

- **验什么**：`context/**` 下非 INDEX 的文档首行是 `---`；`name` 等于文件名、`layer` 等于所在目录、
  `description` 非空；`affects:` 里的路径存在且不含 glob。
- **配置**：`HARNESS_LAYERS`（层目录名）。
- **失败意味着**：文档无法被路由（层错）或无法被检索（name 错），属于结构性损坏。
- **放宽/替换**：不要放宽 name==文件名，它会传染——检索、链接、索引都依赖它。
  如需更多必填键，在 `checks/30-frontmatter.sh` 加一行断言并同步探针。
- **探针**：`FRONTMATTER.sh` 写一个 name 与文件名不一致的文档并登记进 INDEX。
- **常见误配**：`layer` 写成绝对路径或大驼峰；嵌套目录（`project/sub/x.md`）的 layer 应是第一段 `project`。

## INDEX-COVERAGE — 防孤儿

- **验什么**：`context/<layer>` 下每篇文档都被该层 `INDEX.md`（或其他层 INDEX）收录；
  根 `INDEX.md` 链接了每个存在的层 INDEX。
- **配置**：`HARNESS_LAYERS`。
- **失败意味着**：文档存在但没人能找到——等于没写。
- **放宽/替换**：补 INDEX 行，不要改成「允许未登记」。
- **探针**：`INDEX-COVERAGE.sh` 写一个合规但未登记的文档。
- **常见误配**：INDEX 里只写文件名不写链接——kit 用 `grep -F` 匹配文件名，能过；
  但人类读者点不进去，建议始终写成 `[x.md](x.md)`。

## BUDGET — 入口文档预算

- **验什么**：`HARNESS_BUDGET_FILES` 的字节总和 ≤ `HARNESS_BUDGET_BYTES`。
- **配置**：两者都必需。
- **失败意味着**：入口文件开始承载本该下沉到 `context/` 的细节，Agent 的上下文会被挤占。
- **放宽/替换**：先删重复内容或下沉到 `context/`；确需提高预算时在决策记录里写清理由。
  **不要**把预算调大作为修法。
- **探针**：`BUDGET.sh` 把入口文档撑爆。
- **常见误配**：预算单位搞错（是字节不是字符，中文 3 字节）；把多个文件塞进列表却不改预算。

## SKILL-REF — skill 采用状态契约

- **验什么**：`HARNESS_SKILL_DOC` 的 `## <HARNESS_SKILL_SECTION>` 表格里，
  第 1 列 skill 名、第 2 列状态；状态含「缺失 / 不采用 / 未装 / unavailable」的 skill，
  不得出现在 `HARNESS_ENTRY_DOCS` 中。
- **配置**：`HARNESS_SKILL_DOC`、`HARNESS_SKILL_SECTION`、`HARNESS_ENTRY_DOCS`。
- **失败意味着**：入口文件要求执行一个明确不可用的 skill，Agent 会卡住或瞎试。
- **放宽/替换**：改状态列而**不是**改列位；列位是契约，挪列会让检查静默读错。
  新增状态词时同步 `checks/60-skill-ref.sh` 的正则。
- **探针**：`SKILL-REF.sh` 加一行「缺失」的 skill 并在入口文档提及它。
- **常见误配**：把「已安装 / 缺失」这类运行态写进表——会天天过期，kit 的语义是「采用 / 不采用」。

## PROGRESS-SRC — 进度源唯一

- **验什么**：除 `HARNESS_PROGRESS_FILE` 外的文档不得出现 `- [ ]` / `- [x]`（剥掉围栏后）。
- **配置**：`HARNESS_PROGRESS_FILE`；存量走 `baselines/progress.baseline.txt`。
- **失败意味着**：出现第二份进度真相源，两边会不一致。
- **放宽/替换**：把示例放进 ``` 围栏（围栏内不算）；存量登记基线并逐步清理。
- **探针**：`PROGRESS-SRC.sh` 往任意被扫描文档追加一个复选框。
- **常见误配**：把「验收清单」写在交付文档里——它们确实是待办，应进 `TODO.md` 或被围栏包起来。

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
- **配置**：`HARNESS_GITLEAKS`。
- **失败意味着**：凭据已进提交树。**改历史**比改当前文件重要——kit 只负责拦新增。
- **放宽/替换**：给 gitleaks 配 `.gitleaks.toml` 的 allowlist；内置特征命中请改代码而不是加豁免。
- **探针**：`SECRETS.sh` 在运行时拼出关键字与值，避免探针源码自己命中。
- **常见误配**：`required` 模式下 CI 镜像没装 gitleaks → 直接红，这是 fail-closed 的预期行为；
  想容忍就显式设 `optional`。

---

## 最小步骤：新增一项检查

1. 建 `checks/NN-id.sh`，头部写 `# id / # tag / # desc`（需要快检就加 `# fast: 1`）。
2. 在文件里 `. "$HARNESS_KIT/lib/util.sh"`，失败调用 `h_fail TAG "说明"`，末尾 `[ "$H_FAILS" -eq 0 ]`。
3. 新增配置项（可选）：写进 `harness.config.example.sh`，并在 `lib/config.sh` 给默认值与 `export`。
4. 写 `canary/probes/TAG.sh`：接收沙箱路径 `$1`，注入一个已知违规。
5. 跑 `harness check`（干净仓库必须仍绿）与 `harness canary`（新 tag 必须红）。
6. 在本文件补一节，写清验什么、怎么放宽、常见误配。

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
