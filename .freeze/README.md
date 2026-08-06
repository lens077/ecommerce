# .freeze/ — 冻结验收集(Frozen Nodes)

这里存的不是测试本身,而是**一组验收测试文件的内容哈希清单**。它是 Graph
Engineering 三道防线里的 **Frozen Nodes**:实现方(Codex / 任何优化器)无权
修改考题,改了就会被 CI 报红。

## 里面有什么

每个冻结集两份文件(不要手改):

- `<feature>.sha256` — `sha256sum` 格式的哈希清单,记录被冻结文件的内容指纹。
- `<feature>.meta` — 冻结时的元信息(feature 名、冻结时间 UTC、git commit、文件数)。

## 工作流

1. **设计通过后、实现动工前**,由 CC 把验收标准写成测试,然后冻结:
   ```bash
   scripts/freeze.sh <feature> <测试路径> [<更多路径/目录> ...]
   git add .freeze/<feature>.sha256 .freeze/<feature>.meta
   git commit -m "test(freeze): 冻结 <feature> 验收集 — 实现方勿改"
   ```
2. **实现循环 / 验收循环**里随时校验:
   ```bash
   scripts/verify-freeze.sh            # 全部
   scripts/verify-freeze.sh <feature>  # 单个
   ```
3. **CI**(`.github/workflows/freeze-check.yml`)在每个 PR / 分支 push 上跑
   `verify-freeze.sh --all`,不过即挂。

## 两层防线(为什么改考题挡得住)

- **静默漂移** —— 实现方偷偷改了冻结的测试、但没重跑 `freeze.sh`:
  `verify-freeze.sh` 发现文件内容 ≠ 清单哈希,**CI 直接红**。这是自动锚点。
- **正规变更** —— 确实需要更新验收集时,必须重跑 `freeze.sh` 刷新清单,于是
  `.freeze/` 会出现在 diff 里。这一步**不允许实现方自己拍板**:
  - `.github/CODEOWNERS` 把 `/.freeze/` 的改动指给人工/CC 审批;
  - 评审时 `/adversarial-review` 的规则是「diff 里动了测试文件直接标红」。

换句话说:CI 挡「偷改」,人工审批挡「明改」。两者都绕不过去,考题才真的冻住。

## 注意

- 冻结的文件应当是 **git 跟踪**的;冻结未跟踪文件时 `freeze.sh` 会告警(CI
  checkout 后可能查无此文件)。
- 删除 / 移动已冻结文件也会被 `verify-freeze.sh` 记为 `MISSING` 而报红 ——
  要移动,先走审批重新冻结。
