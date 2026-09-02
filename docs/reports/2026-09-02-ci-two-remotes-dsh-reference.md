# 2026-09-02 CI 复盘：对照 deepseek-harness 的 GitLab 流水线，定稿两远端职责

> 起因：用户问「`deepseek-harness/.gitlab-ci.yml` 对本项目前后端 CI 有什么可学的？本仓的 GitLab CI 已经过时，GitHub CI 可能也是」。
> 本文回答四件事：**参考文件里哪些模式值得搬、哪些不搬**；**本仓 CI 实测过时在哪**；**这轮改了什么、为什么发布权留在 GitHub**；**门禁首跑抓到的 bug 与修法**。
> 结论先行：GitLab（origin）= 每次 push / MR 的代码门禁，GitHub = 仅发布 tag 的构建、签名、发布链；**同一个发布 tag 只允许一边写镜像仓**。规范落点在 [`context/team/git-commit.md`](../../context/team/git-commit.md)「两个远端的 CI 职责切分」，本文只保存推理与证据。

## 一、参考文件是什么

`/Users/sumery/lens077/deepseek-harness/.gitlab-ci.yml`（130 行）是一条**纯粹的「tag 触发 → 构建 → 验证制品 → 发布」流水线**：只有 `python-vX.Y.Z` 形式的 tag 才建流水线，构建 4 个 wheel，逐个在干净环境里安装并跑冒烟，最后发布到 GitLab Package Registry。

它与本仓 2026-08-20 起的纪律「CI 仅由发布 tag 触发」同构，所以价值不在语法，而在它把**「发布 tag 应该证明什么」**写成了一串可执行断言。

## 二、值得搬的六个模式

| # | 参考文件里的做法 | 本仓现状 | 落地方式 |
|---|---|---|---|
| 1 | 顶层 `workflow: rules` + `when: never` 兜底：一处决定「什么事件建流水线」 | GitLab 侧只有 job 级 `rules`；GitHub 侧 6 个 workflow 各写 `on:`，裸 semver 模式手抄 5 份、前驱 tag 查找重复 3 份 | **本轮已做**：`.gitlab-ci.yml` 顶层 `workflow: rules`，tag 不建流水线 |
| 2 | tag ↔ 版本真相源一致性断言（`test "$CI_COMMIT_TAG" = "python-v$DSH_VERSION"`） | tag 四条纪律（不可变 / 指向 main / 递增 / 双标）全靠人守，CI 零校验 | 待办：`git merge-base --is-ancestor` 断言指向 main；当前 tag 必须大于前驱；推镜像前查 registry 里 `X.Y.Z` 是否已存在（`docker push` 对已有 tag 是静默覆盖） |
| 3 | 制品的**运行时**冒烟：wheel 装进干净 venv 跑场景，Linux 上再进 manylinux 容器跑一遍并断言 `GLIBC ≤ 2.28` | 镜像做了 buildx → SBOM → Trivy → Cosign，但从未 `docker run` 过 | 待办：从不可变 digest 拉起容器探 `/healthz` 或 `--version`，amd64 / arm64 各一次 |
| 4 | 发布前清点断言：制品数量 `= 4`、每个文件名逐个 `test -f`、`twine check` | `update-manifests` 只依赖 `needs: ci` 的成功状态，不核对「matrix N 个服务 → registry N 个 `X.Y.Z`」 | 待办：回写前核对数量 |
| 5 | `resource_group` 串行化发布 | GitHub 侧 `concurrency: cancel-in-progress: false` + 回写 rebase 重试 3 次，语义等价 | 不改；若在 GitLab 建发布链，用 `resource_group` 替代重试循环 |
| 6 | 版本号从 `package.json` 读，不手抄；工具版本固定 | pnpm 版本三处不一致：`packageManager: pnpm@11.22.0` / consumer Dockerfile `PNPM_VERSION=11.6.0` / `frontend.yml` `version: latest` | **本轮已做**（GitLab 侧）：`frontend-gate` 从 `packageManager` 字段取版本。Dockerfile 与 `frontend.yml` 待收口 |

## 三、不搬的两点

- **runner 按平台打 tag 做原生多架构构建**（`tags: [linux-arm64, macos-arm64]`）：参考项目有自建 runner。本仓在 gitlab.com 上要么 QEMU（GitHub 侧现状），要么 SaaS arm64 runner——是否在套餐内本地无法验证，不当已知。
- **GitLab Package Registry 作为制品目的地**：集群拉 TCR 是刻意的（LAN 直连，`service-ci.yml` 头注写明），GitLab Container Registry 会重蹈「拉 ghcr.io 要过代理」的坑。

## 四、本仓 CI 实测过时在哪（2026-09-02）

按严重度排序：

1. **`backend.yml` 的 `update-manifests` 是一步假 GitOps**。头注与 job 都按「ArgoCD 监听 `helm/values.yaml` 自动同步」设计，但 `AGENTS.md` 明确 GitOps 当前是断的、`helm/values.yaml` 不是集群真相源。这个 job 每次发版用 admin PAT（`MANIFEST_PUSH_TOKEN`）推一个没人消费的文件到 main——这是唯一一处 CI 能改 main 的口子。
2. **前端 CI 等于没有**。`frontend.yml` 只剩每周一次的线上登录冒烟；`pnpm ready`（fmt + lint + test + build）在任何 CI 里都不跑；`apps/consumer` 与 `apps/consumer-next` 有 Dockerfile 但没有构建发布路径（头注列出的四项前提未确认）。
3. **pnpm 版本三处不一致**（见上表 #6）。
4. **tag 纪律零 CI 校验**（见上表 #2）。
5. **GitLab 侧 `.gitlab-ci.yml` 不算过时，是刻意最小化**——只跑 `context-gate`。问题在头注「GitLab 侧没有 Actions」把「按纪律不在这里发布」写成了「这里不能跑 CI」。
6. GitHub Actions 版本本身不旧（`checkout@v5`、`setup-node@v6`，Trivy / CodeQL 按 SHA 固定），不为版本号动手。

## 五、为什么发布权留在 GitHub

搬去 GitLab 能得到的：消掉「tag 要推第二个远端」这个脚枪（可用 GitLab push mirroring 解决，不必挪发布链）；protected tags + protected variables 的凭据暴露面更窄；自建 runner 可放集群同一 LAN（本仓没有）。`CI_JOB_TOKEN` 免凭据发布只对 GitLab 自家 registry 有效，集群拉 TCR，用不上。

搬去 GitLab 会失去的，且都是 `service-ci.yml` 里**已经跑通并绑死在 GitHub** 的：

- Cosign keyless 签名身份：`CERT_IDENTITY_RE` 硬编码 `https://github.com/lens077/ecommerce/.github/workflows/...@refs/tags/...`。换平台则验签正则、将来的 Kyverno `verifyImages` 策略都要改，已发布镜像与新镜像签名身份不一致。
- Trivy SARIF 的上报目的地是 GitHub Code scanning，历史 alert 断档。
- GHCR 双推靠 `GITHUB_TOKEN` 免配置；从 GitLab 推 GHCR 要再存一个 PAT，凭据反而多一个。
- buildx 缓存走 `type=gha`。
- 费用：GitHub 侧实测零计费（public 仓 + 标准 runner，`context-gate.yml` 头注有账单数据）；gitlab.com 免费档 compute minutes 有上限，一次发版是 10 个服务 × 多架构 buildx，具体额度待查。

结论：留在 GitHub 不是因为 GitHub 更好，是因为供应链那一整套已在那边成型，搬家是纯成本换不到新能力。GitLab 是日常 push 的去处，却曾只有一道结构门禁——把不需要凭据的门禁放 GitLab、把需要凭据和身份的发布留 GitHub，两边没有重叠逻辑，就不会漂移。

**硬约束**：同一个发布 tag 只允许一边写镜像仓与回写清单。要在 GitLab 侧加任何构建，必须保持「不推、不回写」，否则不可变 tag 被写两次、Cosign 签两次、SBOM 记两个 digest。

## 六、这轮写了什么

提交 `89758a2` `ci(harness): GitLab 侧补 backend-gate/frontend-gate，两远端 CI 职责定稿`：

| 文件 | 改动 |
|---|---|
| `.gitlab-ci.yml` | 重写。顶层 `workflow: rules`（MR 建；分支 push 建，但分支已有开着的 MR 时不重复建；tag 与 schedule / api / web 一律不建）；`default: interruptible: true`（同分支新 push 取消旧流水线，gitlab.com 分钟计量）；`context-gate` 原样保留；新增 `backend-gate`（`golang:1.27`，`go build && go vet && go test -short -count=1 ./...`，`./...` 已含 structcheck，GOMODCACHE / GOCACHE 落项目目录做 cache，按 `backend/` `helm/` `.service-matrix.yaml` 路径触发）；新增 `frontend-gate`（`node:24`，pnpm 版本读 `packageManager` 字段，`pnpm install --frozen-lockfile && pnpm ready`，按 `frontend/` 路径触发）。头注改写为两远端职责说明 |
| `context/team/git-commit.md` | 「发布 tag 与 CI 触发」下新增「两个远端的 CI 职责切分」小节：职责表、不搬发布链的理由、硬约束 |
| `context/harness-framework/evolution-log.md` | 追加 2026-09-02 条目（硬规则 5：改 CI 门禁必须写触发事故） |
| `TODO.md` | §0 记录本次定稿，并列出 GitHub 侧五项待办 |

两道新门就是 `AGENTS.md`「命令与验收锚点」里的本地锚点原样搬进 CI，没有新逻辑。

## 七、验证与门禁首跑抓到的 bug

提交前：`glab ci lint` 对 gitlab.com 校验通过；`scripts/verify-quick.sh` 本地全绿（实测 2026-09-02：backend 41s / frontend 72s）；`golang:1.27` 镜像在 Docker Hub 存在；`scripts/verify-context.sh` 全绿。

推送后 pipeline #77（实测 2026-09-02）：`backend-gate` 绿（约 6 分钟）、`context-gate` 绿、**`frontend-gate` 红**——`apps/consumer/src/providers/AuthProvider.test.tsx`「已登录用户收到 401 仍然跳登录」断言失败。本地 8 次直跑 + 8 次 CPU 压测全绿，压不出来。

CI 日志给出根因：401 到达时 provider 打的是「匿名请求收到 401，不跳转」，即 DOM 已渲染 `isAuthenticated=true`，但 `isAuthenticatedRef` 仍为 `false`。`AuthProvider.tsx` 用 `useEffect`（passive effect）同步这个 ref，它在 commit 之后异步执行；测试的 `waitFor` 靠 MutationObserver 看到 DOM 变化即放行，快机器上 passive effect 恰好先跑完，慢 runner 上卡在中间。这是生产代码里快照落后状态一个 tick 的真实缝隙，不只是测试不稳。

修法（提交 `19a7a93` `fix(consumer): AuthProvider 登录态快照改 useLayoutEffect 同步，堵 401 误判缝隙`）：ref 同步改为 `useLayoutEffect`，在 commit 阶段同步落地，快照与 DOM 同一时刻可见。本地 `pnpm ready` 绿；重推后流水线绿。该提交只动了 `frontend/`，第二条流水线只跑了 `frontend-gate` + `context-gate`，`backend-gate` 按 `rules: changes` 跳过——路径过滤按设计生效。

**未验证**：gitlab.com 共享 runner 的 compute minutes 消耗；`next build` 在共享 runner 内存上限下的长期稳定性。

## 八、剩余待办（GitHub 侧，本轮未动）

1. `backend.yml` 的 `update-manifests`：GitOps 断开期间是假回写，且持有能推 main 的 admin PAT——修 GitOps 使其有意义，或先关掉并撤销 PAT。
2. 发布 tag 三断言：指向 main、大于前驱、registry 里不存在同名版本 tag。
3. 镜像从 digest 拉起的启动冒烟，amd64 / arm64 各一次。
4. pnpm 版本收口：consumer Dockerfile 与 `frontend.yml` 都改为读 `packageManager` 字段。
5. 前端镜像构建发布路径重建，前提是先确认 `frontend.yml` 头注列出的四项不存在物。

可选：GitLab push mirroring 到 GitHub，让 `git push origin X.Y.Z` 一条命令触发发布，消掉「tag 必须推 github 远端」的人工纪律；把内联在 GitHub YAML 里的前驱 tag 查找、受影响服务计算抽成 `scripts/`，为两平台共用做准备。

## 附：一条题外发现

两次 push 之间，另一个会话在本仓运行了 `git filter-repo`，整条历史哈希改写并推到两个远端（`151c941` → `89758a2` 等），原工作区里不属于本轮的改动进了 `stash@{0}: wip-before-filter-repo`。本轮两个提交内容核对完整；该 stash 未动。
