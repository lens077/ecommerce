# Graph Engineering — 多闭环 AI 工作流方法论

> 本文是一次方法论讨论的存档（原文口吻保留，含"要不要我帮你做"之类对话句式）。
> **落地现状（2026-08-07）**：冻结节点已实现——`scripts/freeze.sh` + `scripts/verify-freeze.sh`
> + CI（`.github/workflows/freeze-check.yml`、`.gitlab-ci.yml`）+ `.freeze/`（机制见 `.freeze/README.md`，
> 但注意 `.sha256` 清单格式与本文设想的 `git rev-parse`/`sha256sum -c` 细节不同，以脚本为准）。
> 文中的 `scripts/anchor.sh` **尚未创建**，锚点命令目前直接内联在 `AGENTS.md`
> 与 `context/team/runbook.md` 里。hcom 相关部分未落地。

第 0 步:用 hcom 之前必须先立的两根桩(hcom 不管)
① 锚点(Anchor)= 一条谁都改不了含义的"真绿"命令。 你这仓现成:

# 这就是 Loop 2/3 唯一认的事实,不是 agent 说"没问题"
```shell
cd backend && go test ./... && go vet ./...   # structcheck 也在 go test 里
```
把它固定成一个脚本 scripts/anchor.sh,让所有 agent 只允许引用它的退出码。

② 冻结节点(Frozen Node)= git 约定,让实现方碰不了考题。
```shell
# 设计通过后、Codex 动工前,CC 把验收标准写成测试,单独一个 commit:
git add <那些测试文件>
git commit -m "test(freeze): 冻结验收集 for <feature> — 实现方勿改"
git rev-parse HEAD > .freeze/<feature>.sha    # 记下冻结点
```

# 记下被冻结测试文件的哈希,验收时比对
```shell
git ls-files -s <测试文件...> | sha256sum > .freeze/<feature>.hash
```
验收时只要 sha256sum -c 不过,就说明测试被动过 → 直接标红打回。这一步是整套里最关键、也恰恰是 hcom / codex-orchestrator 都给不了的——要不要我直接把它做成一个 scripts/freeze.sh + scripts/verify-freeze.sh + 一条 CI check,焊进你仓库?

第 1 步:分两档用,别一上来就 mesh
A 档(小改动 / 单功能)——根本不用 hcom。 你那句"小改动降级只走第 3 步"是对的:一个 claude 会话里 /adversarial-review + go test 就够,我这边一个会话就能同时派 Claude 子 agent + Codex 并行评审(这次评审就是这么跑的)。上 hcom 是有成本的(互信风险 + 协调开销),只在核心模块 / 你要并行铺开多个功能闭环时才拉起来。

B 档(核心模块 / 并行 swarm)——这才是 hcom 的主场。 下面全是 B 档。

第 2 步:B 档,把 Loop 0–4 映射成 hcom 终端
心智:每个 Loop 就是一个带 --tag 的常驻终端,靠 hcom send 交接,靠 hcom list 看谁在、hcom kill 收摊。

# Loop 0(你):不用 agent,你在协调台看 hcom list、决定放行/打回

# Loop 1 设计循环 —— 设计者与审查者必须是两个隔离会话
```shell
hcom claude --tag design \
  --hcom-prompt "为 <feature> 写设计稿到 docs/design/<feature>.md;写完 hcom send 通知 review-design"
hcom claude --tag review-design \
  --hcom-prompt "只审 design 的设计稿:先跑 /grilling 再跑 /adversarial-review;有致命问题 hcom send 打回 design,通过才 send 给 human"
#            ↑ 关键:review-design 是全新会话,不继承 design 的自我合理化(对应"向上盲视"那条)
```

# 冻结点(你确认设计通过后,在 design 终端让它写测试并 freeze commit,见第 0 步)

# Loop 2 实现循环 —— Codex 干活,只认冻结测试
```shell
hcom codex --tag exec \
  --hcom-prompt "按 docs/design/<feature>.md 实现;每轮跑 ./scripts/anchor.sh,不绿就自修;全绿再 hcom send 给 review-diff。禁止修改 .freeze 里列出的测试文件"
```

# Loop 3 验收循环 —— 又一个隔离的 fresh Claude,跨模型族互查
```shell
hcom claude --tag review-diff \
  --hcom-prompt "收到 exec 完成后:①先 sha256sum -c .freeze/<feature>.hash,不过直接标红打回;②/adversarial-review 审 diff,专挑测试盖不到的毛病;③只把 CONFIRMED 的发现 hcom send 打回 exec,全过 send 给 human"
```

# Loop 4 审计(你,每 N 轮):hcom list 回看各 loop transcript,复盘 CC 设计是否系统性出错、验收有没有放水、冻结集是否该更新 → 结论回喂 Loop 0

几个要点:

hcom send 的寻址(按 tag 发 / 群发)以你本机 hcom send --help 或仓库自带的 confess 示例为准——它内置的 confess 工作流(目标自评 → 独立 calibrator 读 transcript → judge 裁决)几乎就是你 Loop 1/3 的模板,值得先照着跑一遍找手感。
异构是刻意的:执行者用 codex、审查者用 claude,失败模式不同才能互查盲区(你判据表最后一行)。
审查者永远新开会话,不要 resume 设计者的会话——一旦继承上下文,"loops watching loops" 就退化成自己审自己。
第 3 步:并行 swarm(你说你喜欢的那种)
要同时推 N 个功能,就是把上面这组按 feature 复制,--tag 加 feature 前缀:

hcom codex --tag exec-order   --hcom-prompt "实现 order..."
hcom codex --tag exec-payment --hcom-prompt "实现 payment..."
hcom claude --tag review-order   --hcom-prompt "审 exec-order..."
hcom claude --tag review-payment --hcom-prompt "审 exec-payment..."

碰撞检测默认开(两个 agent 30 秒内改同一文件都会被通知),这对并行改同构的 10 个服务(你仓库里 internal/pkg 那种一改要改 10 份的)正好防打架。你在协调台 hcom list 看全景,只在有闭环卡住时介入。

三个必须盯死的陷阱
别让"互发消息"替代锚点。 一堆 agent 靠 hcom send 互相说"我这边 OK"——这正是古德哈特的温床。放行的唯一依据是 ./scripts/anchor.sh 退出 0 和 /adversarial-review 的 CONFIRMED,不是任何 agent 的口头背书。 hcom 只送信,不产生事实。
冻结门靠 git,不靠 hcom。 hcom 拦不住 exec 去改测试文件;拦它的是 review-diff 那步的 sha256sum -c 和 CI check。这根桩不立,整套失效。
入网=完全授信的安全面。 hcom 里一个被 prompt-injection 的 peer 能驱动/杀别的 agent。只在你自己这台机跑、别随便 relay 入网别的设备;跨机 token 当 SSH key 保管。
要不要我现在就把第 0 步那套冻结 + 锚点脚本(scripts/anchor.sh、scripts/freeze.sh、scripts/verify-freeze.sh,加一条 CI 里"测试文件哈希变了且无 freeze 批准就 fail"的门)按你仓库实际的 go test / structcheck 接线做出来?这是你这套 Graph 里唯一还没有、且 hcom 永远不会替你做的一块;做好之后,上面那些 hcom 启动命令才真的有牙齿。
