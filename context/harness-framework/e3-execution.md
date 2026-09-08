---
name: e3-execution
layer: harness-framework
description: E3 执行策略（先估计→最小执行→失败才扩张）的出处、与本仓机制的对接、按规模路由、过度阅读护栏 hook 的配置与再验证方法
---

# E3 执行策略：任务多大，就花多大功夫

`AGENTS.md` 的「执行策略」节是常驻精简版；本文是它的完整解释、与本仓机制的对接、
以及护栏 hook 的配置与再验证方法。

## 出处

arXiv:2607.13034《Do AI Agents Know When a Task Is Simple? Toward Complexity-Aware
Reasoning and Execution》（Yin & Feng，2026-07，代码已开源）。论文把 agent 的
「先读全仓求稳」量化为 ACRR（实际成本相对最小充分轨迹的冗余比），关键实测结论：

- 冗余在**最简单的任务上最严重**：模拟基准里 max-context-first 策略在单文件小改上
  的 ACRR 是 22 倍，在仓库级重构上反而只有 5 倍。
- E3 与最强基线同为 100% 成功，但省 85% 成本 / 91% token / 92% 被读文件；
  换成故意打破估计器关键词的措辞后成功率仍 100%，成本只涨 8.7%——效率来自
  「乐观起步 + 验证兜底」这个**架构**，不依赖估计有多准。
- 真模型（gpt-4o 编辑真实库）上收益温和得多（比 ReAct 省 4% token、比
  「be thorough」提示省 18%），但**反面结论最硬**：被指示「先读全部再动手」的
  agent 在最难任务上三跑全败（步数耗尽 / 改错 / 撞限流）。过度阅读不只是慢，
  会把自己读进失败里。
- 论文里 E3 在真模型上就是 12 行 system prompt（`llm_case/prompts.py`），无需代码。

## 策略三步

1. **Estimate**：动手前一步估计任务规模并明确说出来。最多一次廉价探测——
   本仓查拓扑**必须**用 `.service-matrix.yaml` 而不是 grep（既有硬约束，恰好也是
   最便宜的探测）；查规范走 `context/` 索引。规模分三档：
   - **L1** 单文件局部修改；
   - **L2** 少数文件的跨文件修改；
   - **L3** 仓库级重构——警惕 grep 看不到的间接引用点：re-export、别名、
     网关 `discovery:///<name>` 接线、Config Center 键、helm values 这类配置耦合。
2. **Execute**：只读预计要改的文件，不为局部修改通读代码库。改完立即跑
   「命令与验收锚点」里**最便宜的适用命令**（改前端 → `pnpm ready`，改后端 →
   `go build ./... && go vet ./...`，动 matrix → structcheck）。
3. **Expand**：只有验证变红才扩大范围，一次扩一级（再 grep → 追依赖/import →
   读下一个最相关文件），复用已有发现，不推倒重来。措辞听起来局部但探测命中
   多处时，主动降置信、直接按高一级处理——这是论文估计器防翻车的关键规则。

**E3 不豁免硬规则**：runbook §0.1 按改动类型的必读路由、proto 前先读设计文档，
都属于「最小路径」的一部分，不是可以省掉的上下文。

## 按规模路由开销（E3 与 effort/model 路由正交，可组合）

| 估计 | plan mode | 子代理 | reasoning effort（Codex: `model_reasoning_effort`） |
|---|---|---|---|
| L1 | 不开 | 不派 | low |
| L2 | 不开 | 不派 | medium |
| L3 | 值得开 | 值得派 Explore/并行审查 | high |

判据同源：估计既然已经做了，就顺手驱动这些开关，不要 L1 任务开满配。

## 过度阅读护栏 hook（仅 Claude Code）

实测 2026-09-08：原脚本未在已检查的 Claude 目录、备份和相关 Git 历史中找到，已按本文记载的行为重建并接入 Claude 全局配置，不宣称恢复了原件。源码保存在仓库，用户目录只保留 symlink，避免重装后再次丢失。完整依赖状态见 [工具清单](../../docs/agents/skills.md)。

- **源码**：[scripts/e3-overread-guard.py](../../scripts/e3-overread-guard.py)；`~/.claude/hooks/e3-overread-guard.py` 链接到它。
- **接线**：`~/.claude/settings.json` → `hooks.PreToolUse`，matcher `Read|Edit|Write|MultiEdit|NotebookEdit`；命令为 `/usr/bin/python3 /Users/lens/.claude/hooks/e3-overread-guard.py`，timeout 为 5 秒。原有模型配置、插件和 TokenTracker Hook 保留；接线前已在 `~/.claude/backups/` 备份设置。
- **行为**：同一会话在首次编辑调用前，完整 Read 第 6 个不同文件时拦下该次 Read（exit 2），重发即放行，每会话最多提醒一次。带 limit 或非首页 offset 的读取不计数，相对路径按 Hook cwd 规范化去重。
- **编辑边界**：PreToolUse 只能看到编辑意图，不能确认修改成功；任一匹配的编辑调用到达护栏后，本会话后续不再提醒。它不代替审批、沙箱或项目必读规范。
- **状态与故障**：状态位于 Python `tempfile.gettempdir()` 下的 `e3-guard-<SHA256(session_id)>.json`，权限 0600；文件锁保护并发读写，不跟随符号链接。输入损坏、状态损坏或不可写时在 stderr 报诊断并放行，不把辅助提醒变成永久阻塞。
- **适用范围**：同一 session_id 的读取共享计数；不同 session_id 隔离。纯研究和子代理探索可能合理地需要更多上下文，提醒明确允许重试。这次只接入 Claude，未向 DSH 或 Codex 注册此 Hook；两者仍可读取 AGENTS.md 的 E3 文本规则。
- **验证**：9 个独立回归测试通过，覆盖阈值、重试、局部读取、四种编辑工具、会话隔离、并发、坏输入/状态和符号链接。通过全局配置中的真实命令，用隔离的临时 session 得到退出码 `0,0,0,0,0,2,0`；没有启动付费模型会话。新建 Claude 会话后再确认 Hook 生效。
- **再验证方法**（改完 hook 必须重跑，见「静默失效要实测」的教训）：
  ```bash
  SID="test-$$"
  for i in 1 2 3 4 5 6; do
    echo '{"session_id":"'$SID'","tool_name":"Read","tool_input":{"file_path":"/f'$i'"}}' \
      | python3 ~/.claude/hooks/e3-overread-guard.py; echo "file$i -> exit $?"
  done
  # 期望：file1..5 -> exit 0；file6 -> exit 2 且 stderr 有提醒
  # 再验证编辑后静默：先喂一条 tool_name=Edit，再喂新 Read，应 exit 0
  ```

## 预期管理（防止半年后有人把这套删掉或加码）

- 别指望论文标题的 85%：那是对机械最坏基线的数字。真模型实测收益是个位数到
  两成 token，主要落在大仓库与深耦合任务上。这套东西的价值一半在省，
  一半在**防**——防「求稳式通读」在难任务上把步数和限流预算烧光。
- 反过来也别加码：**不要**在任何指令文件里写「先通读代码库」「be thorough」
  「read everything first」这类措辞，论文实测它们又慢又更容易失败。
- Expand 依赖便宜的验证器。锚点命令跑不了的环境里（比如裸机脚本仓库），
  E3 退化成 Estimate-only，此时宁可估保守一级。
