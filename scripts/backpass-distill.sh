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
#   ~/.dsh/sessions/<slug>/*/session.jsonl.zstd  DSH（zstd 流,尽力解析——
#       schema 未公开,取 type 含 user 的事件里的长文本字段,宁缺勿错）
#
# 用法: scripts/backpass-distill.sh [仓库路径=当前 git 根] [天数=14] [输出目录=/tmp/backpass-<name>]
# shellcheck 的 SC2044（for-over-find）已知且接受:三个存储的路径由槽位规则生成,
# 不含空白字符;换 while-read 徒增嵌套。
# 产出: <出目录>/human.tsv（源:会话 \t 消息≤500 字）与 markers.txt（纠偏标记命中行）
set -euo pipefail

repo=${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}
days=${2:-14}
name=$(basename "$repo")
out=${3:-/tmp/backpass-$name}
mkdir -p "$out"
: > "$out/msgs.tsv"

cc_slug=$(printf '%s' "$repo" | tr '/' '-')          # /a/b/c → -a-b-c
dsh_slug="-$(printf '%s' "$repo" | tr '/' '-')-"      # DSH 槽位形如 --a-b-c--

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

# ── ③ DSH（zstd 流,尽力解析）─────────────────────────────────
if command -v zstd >/dev/null; then
  for f in $(find "$HOME/.dsh/sessions" -maxdepth 3 -path "*${dsh_slug}*" -name "session.jsonl.zstd" -mtime -"$days" 2>/dev/null); do
    sid=$(basename "$(dirname "$f")" | tail -c 9)
    zstd -dcq "$f" 2>/dev/null | python3 -c '
import sys, json
sid = sys.argv[1]
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: d = json.loads(line)
    except Exception: continue
    t = str(d.get("type", ""))
    if "user" not in t or "chunk" in t: continue
    def texts(o):
        if isinstance(o, str): yield o
        elif isinstance(o, dict):
            for k, v in o.items():
                if k in ("text", "content", "message", "input") or isinstance(v, (dict, list)):
                    yield from texts(v)
        elif isinstance(o, list):
            for v in o: yield from texts(v)
    for s in texts(d.get("data", d)):
        s = s.strip()
        if 0 < len(s):
            s = s.replace("\t", " ⏎ ").replace("\n", " ⏎ ")[:500]
            print(f"DSH:{sid}\t{s}")
            break   # 每事件取首个文本,宁缺勿滥
' "$sid" >> "$out/msgs.tsv" || true
  done
fi

# ── 剔噪:先去同会话重复(DSH 事件会重放同一消息),再剔跨会话注入文档 ──
LC_ALL=C sort -u "$out/msgs.tsv" -o "$out/msgs.tsv"
awk -F'\t' '{ cnt[$2]++ } END { for (m in cnt) if (cnt[m]>=3) print m }' "$out/msgs.tsv" > "$out/injected.txt"
awk -F'\t' 'NR==FNR { inj[$0]=1; next } !($2 in inj) && $2 !~ /^(<|Caveat|\[Request)/ { print }' \
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
