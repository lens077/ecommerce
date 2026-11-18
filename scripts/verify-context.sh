#!/usr/bin/env bash
# verify-context.sh — 知识层门禁入口（实现来自 harness-kit + 本仓适配层）。
#
# 入口契约不变：路径、参数（无）、退出码（0 通过 / 1 违规 / 2 配置或环境错误）。
#
# 分两类实现：
#   harness-kit/checks/        通用判定，参数由 harness.config.sh 提供；
#   scripts/context-adapters/  本仓专属判定（决策记录格式、受管代码块、env 契约、
#                              告警目录正文、正文路径引用），协议与核心检查相同。
#
# 18 个 tag：
#   [DEAD-LINK]    Markdown 相对链接必须可达（跳过围栏、http(s)/mailto、纯锚点）
#   [ORPHAN]       每篇 context 文档被所在层 INDEX 收录；项目/模块两级逐级登记
#   [FRONTMATTER]  非 INDEX 文件有 frontmatter，name 与文件名一致；layer/module 声明须与路径一致
#   [FORMAT]       experience 文档含「症状」与「关键陷阱/陷阱」
#   [EVIDENCE]     experience 的「证据」段每条带来源标签
#   [SKILL-REF]    入口文档不得要求执行登记为不可用的 skill
#   [DECISION]     决策记录：路径即状态，小节齐备，「考虑过的替代方案」非空
#   [BUDGET]       AGENTS.md ≤ 13000 字节；TODO.md ≤ 160000 字节
#   [PROGRESS-SRC] 复选框只允许长在 TODO 体系；基线按计数冻结
#   [EMBED]        受管代码块与源码一致（scripts/doc-embed.py --check）
#   [AFFECTS]      frontmatter affects 每项真实存在、不含 glob
#   [SELFCHECK]    实现单标 done 必须有「## 完成自检」且每条带证据
#   [PATH-REF]     正文反引号里的仓库路径必须存在（scripts/path-refs.py）
#   [ENV-CONTRACT] local-env 工具链块与 go.mod/package.json 相等
#   [GENERATED]    告警规则正文与自带摘要一致
#   [RETIRED]      提到已退役组件时必须同时写明它已退役
#   [INDEX-LINE]   INDEX 单元格字数不超上限
#   [BASELINE]     基线陈旧（已合规/计数下降/文件消失），要求反向收紧
#
# 基线三份，仍留在 scripts/ 下（本仓路径由 harness.config.sh 指定）：
#   共同规则：新增必须合规；基线已不再命中 → [BASELINE]。
#
# 用法: scripts/verify-context.sh

set -euo pipefail

root=$(git rev-parse --show-toplevel) || { echo "verify-context: 不在 git 仓库内" >&2; exit 2; }
cd "$root"

export HARNESS_REPO_ROOT="$root"
export HARNESS_CONFIG="$root/harness.config.sh"

# shellcheck source=../harness-kit/lib/config.sh
. "$root/harness-kit/lib/config.sh"
# shellcheck source=../harness-kit/lib/util.sh
. "$root/harness-kit/lib/util.sh"
# shellcheck source=../harness-kit/lib/runner.sh
. "$root/harness-kit/lib/runner.sh"

h_detect_roots
h_load_config
h_config_validate

h_run_checks
