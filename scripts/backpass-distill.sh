#!/usr/bin/env bash
# backpass-distill.sh — Session 反传的机械蒸馏器（跨仓可用）。
#
# 从本机三个 transcript 存储抽取指定仓库的**人类消息**,供离线反传（backward pass）
# 找「没被当场抓住的 loss」：教了没沉淀、重发现、规则被违反/本身错了。
# 纪律与用法见 context/harness-framework/flywheel-audit.md「Session 反传」节;
# 首轮实测（2026-08-26）最大噪音源 = 以 user 角色注入的 skill 全文,本脚本按
# 「同一正文出现在 ≥3 会话」机械剔除。蒸馏阶段不跑模型;裁决永远在人。
#
# 数据源:
#   ~/.claude/projects/<slug>*/*.jsonl        Claude Code
#   ~/.codex/sessions/**/*.jsonl              Codex（按 cwd 关联仓库）
#   ${DSH_HOME:-~/.dsh}/sessions/<project>/<session>/session[.vN].jsonl[.zstd]
#       DSH v0-v2：只选最高格式代，读取 direct-user 来源并排除 fork seed。
#       压缩使用 Node 内置 zstd 或 zstd CLI；错误写 stderr，不修改原始记录。
#
# 用法: scripts/backpass-distill.sh [仓库路径=当前 git 根] [天数=14] [输出目录=/tmp/backpass-<name>]
# shellcheck 的 SC2044（for-over-find）已知且接受:三个存储的路径由槽位规则生成,
# 不含空白字符;换 while-read 徒增嵌套。
# 产出: <出目录>/human.tsv（源:会话 \t 消息≤500 字）与 markers.txt（纠偏标记命中行）
set -euo pipefail
# Extracted conversation history must not be world-readable.
umask 077

repo=${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}
days=${2:-14}
name=$(basename "$repo")
out=${3:-/tmp/backpass-$name}
mkdir -p "$out"
: > "$out/msgs.tsv"

cc_slug=$(printf '%s' "$repo" | tr '/' '-')          # /a/b/c → -a-b-c
# DSH uses its authoritative header cwd, not lossy directory-name matching.

# ── ① Claude Code ────────────────────────────────────────────
for f in $(find "$HOME/.claude/projects" -maxdepth 2 -path "*${cc_slug}*" -name "*.jsonl" -mtime -"$days" 2>/dev/null); do
  sid=$(basename "$f" .jsonl | cut -c1-8)
  jq -r --arg sid "CC:$sid" 'select(.type=="user" and (.isMeta|not)) | .message.content
    | (if type=="string" then . elif type=="array" then ([.[] | select(.type=="text") | .text] | join(" ⏎ ")) else empty end)
    | select(length>0) | [$sid, (gsub("[\\n\\t]";" ⏎ ") | .[0:500])] | @tsv' "$f" 2>/dev/null >> "$out/msgs.tsv" || true
done

# ── ② Codex（cwd 关联本仓的会话）──────────────────────────────
for f in $(grep -rl --include="*.jsonl" "$repo" "$HOME/.codex/sessions" 2>/dev/null | head -40); do
  find "$f" -mtime -"$days" | grep -q . || continue
  sid=$(basename "$f" .jsonl | tail -c 9)
  jq -r --arg sid "CX:$sid" 'select(.payload.role=="user")
    | [.payload.content[]? | select(.type=="input_text") | .text] | join(" ⏎ ")
    | select(length>0) | [$sid, (gsub("[\\n\\t]";" ⏎ ") | .[0:500])] | @tsv' "$f" 2>/dev/null >> "$out/msgs.tsv" || true
done

# ── ③ DSH：读取最高格式代，按明确来源排除注入与 fork 前缀 ──────
# Resolve the physical script so the shared backpass-distill.sh symlink works.
script_dir=$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve().parent)' "${BASH_SOURCE[0]}")
python3 "$script_dir/backpass-dsh.py" "$repo" "$days" >> "$out/msgs.tsv"

# ── 剔噪:先去同会话重复(DSH 事件会重放同一消息),再剔跨会话注入文档 ──
LC_ALL=C sort -u "$out/msgs.tsv" -o "$out/msgs.tsv"
awk -F'\t' '{ cnt[$2]++ } END { for (m in cnt) if (cnt[m]>=3) print m }' "$out/msgs.tsv" > "$out/injected.txt"
awk -F'\t' 'FILENAME==ARGV[1] { inj[$0]=1; next } !($2 in inj) && $2 !~ /^(<|Caveat|\[Request)/ { print }' \
  "$out/injected.txt" "$out/msgs.tsv" > "$out/human.tsv"

grep -E '不对|不是这|不要|别再|错了|错的|不行|你怎么|为什么没|怎么没|漏了|又忘|还是没|重新|回滚|其实' \
  "$out/human.tsv" > "$out/markers.txt" || true

total=$(wc -l < "$out/msgs.tsv" | tr -d ' ')
human=$(wc -l < "$out/human.tsv" | tr -d ' ')
hits=$(wc -l < "$out/markers.txt" | tr -d ' ')
sessions=$(cut -f1 "$out/human.tsv" | sort -u | wc -l | tr -d ' ')
echo "backpass-distill: $name 近 ${days} 天 — 原始 $total 条 → 人话 $human 条（$sessions 会话），纠偏标记命中 $hits 条"
echo "  产出: $out/human.tsv · markers.txt · injected.txt（被剔除的注入文本）"
echo "  下一步（人工/会话内）: 逐条核实 markers.txt,新规则须 ≥2 独立会话,落点按 knowledge-layering 分层"
