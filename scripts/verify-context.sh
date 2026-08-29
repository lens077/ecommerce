#!/usr/bin/env bash
# verify-context.sh — context/ 知识库与 AGENTS.md 的结构门禁。
#
# 参照 deepseek-harness 的 doc-sync 门禁族(verify-md-links / verify-doc-refs /
# verify-agent-note-format / verify-doc-budgets)移植,落地方式沿用本仓惯例:
# 能判定的约束变成脚本,存量漂移走基线棘轮(见 scripts/lint-baseline.sh 的设计)。
#
# 九项检查(任一违规 → 退出码 1):
#   [DEAD-LINK]    AGENTS.md/README.md/STACK.md 与 context/**、docs/design/** 的
#                  相对 markdown 链接必须可达(2026-08-26 扩:原只查 AGENTS+context,
#                  当日 README/STACK/docs/design 三处死链全靠临时脚本抓到——
#                  宪法原则 I「引用不存在的文档即 CI 失败」由此机械化;
#                  跳过代码块、http(s)/mailto、纯锚点;带 #fragment 的只查文件部分)
#   [ORPHAN]      context/ 下每个非 INDEX 文件必须被所属层的 INDEX.md 链接;
#                  模块 INDEX 必须被 project/ecommerce/INDEX.md 链接
#   [FRONTMATTER] 非 INDEX 文件必须有 frontmatter 且 name/description 齐全,
#                  name 与文件名一致;layer:/module: 若存在必须与路径一致
#   [FORMAT]      experience/*.md 必须含「症状」与「关键陷阱/陷阱」小节
#                  (格式定义见 context/harness-framework/knowledge-layering.md)
#   [EVOLOG]      evolution-log.md 每条必须四要素齐全(改了什么/为什么/触发事故/怎么验证的)
#   [BUDGET]      AGENTS.md ≤ 14000 字节 —— 它每轮整份注入所有 AI 工具的上下文,
#                  超限先把内容搬进 context/ 对应层,不要先提额度;
#                  TODO.md ≤ 96000 字节 —— 每个提交回合都要读它,
#                  超限把证据长文/会话记录按日期归档进 docs/progress-archive/
#   [PROGRESS-SRC] 复选框(`- [ ]`/`- [x]`)只允许长在 TODO 体系与不可变归档里
#                  (TODO.md / docs/todo/ / progress-archive/ / reports/ / 选型对抗/ /
#                   .scratch/ / 围栏代码块内);别处出现即第二套进度视图,
#                  与 TODO.md 必然漂移。2026-08-29 立此门禁,见 evolution-log 同日条目
#
# 基线棘轮(两份):
#   scripts/context-format-baseline.txt   —— [FORMAT] 的存量违规冻结放行
#   scripts/context-progress-baseline.txt —— [PROGRESS-SRC] 的存量,**按计数**冻结
#   共同规则:新增必须合规;基线条目已合规/数字降了/文件消失 → [BASELINE] 报错要求
#   改行或删行(反向棘轮,防止基线变成永久免罪符)。
#
# 用法: scripts/verify-context.sh
set -euo pipefail

root=$(git rev-parse --show-toplevel) || { echo "verify-context: 不在 git 仓库内" >&2; exit 2; }
cd "$root"

baseline_file="scripts/context-format-baseline.txt"
violations=$(mktemp "${TMPDIR:-/tmp}/verify-context.XXXXXX")   # BSD/GNU/busybox 三方兼容的写法
trap 'rm -f "$violations"' EXIT

fail() { # 记一条违规: fail <TAG> <正文>
  printf '  [%s] %s\n' "$1" "$2" >> "$violations"
}

# 剥掉 ``` 围栏代码块后输出正文(避免把示例里的链接当成真链接)
_strip_fences() {
  awk 'BEGIN{f=0} /^```/{f=!f; next} !f{print}' "$1"
}

in_baseline() { # 路径是否被基线豁免
  [ -f "$baseline_file" ] && grep -q "^$1\([[:space:]]\|\$\)" "$baseline_file"
}

# ── 1. 链接可达性 ─────────────────────────────────────────────
while IFS= read -r file; do
  dir=$(dirname "$file")
  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in
      http://*|https://*|mailto:*|\#*) continue ;;   # 外链与纯锚点不查
      *://*) continue ;;
    esac
    path="${target%%#*}"                              # 去掉 #fragment
    [ -z "$path" ] && continue
    if [ ! -e "$dir/$path" ]; then
      fail "DEAD-LINK" "$file → $target"
    elif git check-ignore -q "$dir/$path" 2>/dev/null; then
      # 本机磁盘上有、但被 gitignore ——提交的树里不存在,对 fresh clone/CI 就是死链。
      # 首跑 CI 抓到过真实案例(ai-helper.sh);没有这条,本机绿 CI 红。
      fail "DEAD-LINK" "$file → $target(目标被 gitignore,不在提交树里)"
    fi
  done < <(_strip_fences "$file" | grep -oE '\]\([^)]+\)' | sed 's/^](//; s/)$//' || true)
done < <(find AGENTS.md README.md STACK.md context docs/design -name "*.md" -type f)

# ── 2. INDEX 覆盖性(孤儿检测)────────────────────────────────
# 层入口: context/INDEX.md 必须链接三个层 INDEX
for layer_index in team/INDEX.md harness-framework/INDEX.md project/ecommerce/INDEX.md; do
  grep -qF "$layer_index" context/INDEX.md || fail "ORPHAN" "context/INDEX.md 未链接 $layer_index"
done

# team / harness-framework: 每个文件都要出现在本层 INDEX 里
for layer in team harness-framework; do
  while IFS= read -r file; do
    base=$(basename "$file")
    grep -qF "$base" "context/$layer/INDEX.md" || \
      fail "ORPHAN" "$file 未登记进 context/$layer/INDEX.md"
  done < <(find "context/$layer" -name "*.md" ! -name "INDEX.md" -type f)
done

# project/ecommerce: 文件 → 模块 INDEX;模块 INDEX → 项目 INDEX
while IFS= read -r file; do
  rel="${file#context/project/ecommerce/}"
  module="${rel%%/*}"
  base=$(basename "$file")
  if [ "$base" = "INDEX.md" ]; then
    grep -qF "$module/INDEX.md" context/project/ecommerce/INDEX.md || \
      fail "ORPHAN" "模块 $module 未登记进 project/ecommerce/INDEX.md"
  else
    grep -qF "$base" "context/project/ecommerce/$module/INDEX.md" || \
      fail "ORPHAN" "$file 未登记进 $module/INDEX.md"
  fi
done < <(find context/project/ecommerce -mindepth 2 -name "*.md" -type f)

# ── 3. frontmatter ───────────────────────────────────────────
while IFS= read -r file; do
  if [ "$(head -1 "$file")" != "---" ]; then
    fail "FRONTMATTER" "$file 缺少 frontmatter"
    continue
  fi
  fm=$(awk 'NR==1{next} /^---$/{exit} {print}' "$file")
  name=$(printf '%s\n' "$fm" | sed -n 's/^name:[[:space:]]*//p' | head -1)
  stem=$(basename "$file" .md)
  [ -n "$name" ] || fail "FRONTMATTER" "$file 缺 name:"
  printf '%s\n' "$fm" | grep -q '^description:' || fail "FRONTMATTER" "$file 缺 description:"
  if [ -n "$name" ] && [ "$name" != "$stem" ]; then
    fail "FRONTMATTER" "$file name: $name ≠ 文件名 $stem"
  fi
  # layer:/module: 若声明了,必须与真实路径一致(抓复制粘贴漂移)
  layer_val=$(printf '%s\n' "$fm" | sed -n 's/^layer:[[:space:]]*//p' | head -1)
  module_val=$(printf '%s\n' "$fm" | sed -n 's/^module:[[:space:]]*//p' | head -1)
  case "$file" in
    context/team/*)              expect_layer="team" ;;
    context/harness-framework/*) expect_layer="harness-framework" ;;
    context/project/ecommerce/*)
      rel="${file#context/project/ecommerce/}"
      expect_layer="project/ecommerce/${rel%%/*}" ;;
    *) expect_layer="" ;;
  esac
  if [ -n "$layer_val" ] && [ "$layer_val" != "$expect_layer" ]; then
    fail "FRONTMATTER" "$file layer: $layer_val ≠ 路径推导 $expect_layer"
  fi
  if [ -n "$module_val" ] && [ "project/ecommerce/$module_val" != "$expect_layer" ]; then
    fail "FRONTMATTER" "$file module: $module_val 与路径不符"
  fi
done < <(find context -name "*.md" ! -name "INDEX.md" -type f)

# ── 4. experience 四段格式(症状 + 关键陷阱是硬要求)──────────
has_section() { # has_section <file> <标题>: **X** / **X：副标题** / ## X 任一形式
  grep -qE "^\*\*$2([：:][^*]*)?\*\*|^#{2,3} $2" "$1"
}
while IFS= read -r file; do
  ok=1
  has_section "$file" "症状" || ok=0
  { has_section "$file" "关键陷阱" || has_section "$file" "陷阱"; } || ok=0
  if [ "$ok" = 0 ]; then
    if in_baseline "$file"; then
      : # 存量冻结放行
    else
      fail "FORMAT" "$file 缺「症状」或「关键陷阱」小节(写法见 knowledge-layering.md)"
    fi
  else
    if in_baseline "$file"; then
      fail "BASELINE" "$file 已合规,请从 $baseline_file 删除该行(反向棘轮)"
    fi
  fi
done < <(find context -path "*/experience/*.md" -type f)

# 基线里指向不存在文件的行必须删(防陈旧)
if [ -f "$baseline_file" ]; then
  while IFS= read -r line; do
    entry="${line%%[[:space:]]*}"
    case "$entry" in ""|\#*) continue ;; esac
    [ -f "$entry" ] || fail "BASELINE" "基线条目已不存在: $entry,请从 $baseline_file 删除"
  done < "$baseline_file"
fi

# ── 5. evolution-log 四要素 ──────────────────────────────────
evolog="context/harness-framework/evolution-log.md"
while IFS= read -r title; do
  block=$(awk -v t="$title" '
    $0 == t {on=1; next}
    /^### / {if (on) exit}
    on {print}' "$evolog")
  for req in "改了什么" "为什么" "触发事故" "怎么验证的"; do
    printf '%s\n' "$block" | grep -q "\*\*$req\*\*" || \
      fail "EVOLOG" "「${title#\#\#\# }」缺 **$req**(四要素缺一不可)"
  done
done < <(grep '^### ' "$evolog")

# ── 6. AGENTS.md 预算 ────────────────────────────────────────
budget=14000
size=$(wc -c < AGENTS.md | tr -d ' ')
if [ "$size" -gt "$budget" ]; then
  fail "BUDGET" "AGENTS.md ${size}B > ${budget}B——它每轮整份注入,先把内容搬进 context/,别先提额度"
fi

# ── 6.5 TODO.md 预算 ─────────────────────────────────────────
# 硬规则 #3 要求每次提交前先更新 TODO.md,它因此在每个提交回合都被读入/回写。
# 2026-08-21 它膨胀到 199KB(验收证据长文+会话记录堆积),瘦身后立此门禁。
# 超限的处理不是提额度,而是把非活跃内容(已完成项的证据长文、会话记录)
# 按日期归档到 docs/progress-archive/(不可变历史,非并行真相源),TODO.md 留链接。
todo_budget=96000
todo_size=$(wc -c < TODO.md | tr -d ' ')
if [ "$todo_size" -gt "$todo_budget" ]; then
  fail "BUDGET" "TODO.md ${todo_size}B > ${todo_budget}B——每个提交回合都要读它,把证据长文/会话记录归档进 docs/progress-archive/,别先提额度"
fi

# ── 7. 并行进度源(复选框只允许长在 TODO 体系里)───────────────
# AGENTS.md 反直觉约定:进度真相源是 TODO.md(唯一)。任何别处的 `- [ ]`/`- [x]`
# 都是第二套进度视图,必然与 TODO.md 漂移——2026-08-29 实测到 docs/TECH.md §12
# 自己长出 19 个复选框且已漂移(P1/P2 各勾一项,P0 九项全空,与真实进度不符)。
#
# 放行的位置各有理由:
#   TODO.md / docs/todo/**            —— 进度真相源本体与其分类明细
#   docs/progress-archive/**          —— 不可变历史,顶部自带失效声明
#   docs/reports/**                   —— 带日期的一次性证据
#   docs/技术栈选型对抗/**            —— 带日期的评审存档
#   .scratch/**                       —— issue/spec 工作区(docs/agents/issue-tracker.md)
#   围栏代码块内                       —— 给新项目用的模板占位符(SCAFFOLD.md 就是这种)
progress_baseline="scripts/context-progress-baseline.txt"

# 围栏外复选框计数。**必须按围栏长度配对**:``` 不能关闭 ````,
# 否则 ````markdown 模板里嵌套的 ``` 会把后半段误判成正文
# (上面 _strip_fences 的 f=!f 就有这个缺陷,它只服务 DEAD-LINK 且扫描集里暂无嵌套围栏,
#  本检查不复用它)。
count_checkboxes() {
  awk '
    {
      if (match($0, /^[ \t]*`+/)) {
        s = substr($0, RSTART, RLENGTH); gsub(/[ \t]/, "", s); n = length(s)
        if (n >= 3) {
          if (fence == 0)      { fence = n; next }
          else if (n >= fence) { fence = 0; next }
        }
      }
      if (fence == 0 && $0 ~ /^[ \t]*- \[[ x]\]/) c++
    }
    END { print c+0 }
  ' "$1"
}

progress_allowed() { # 该路径是否豁免
  case "$1" in
    TODO.md|docs/todo/*|docs/progress-archive/*|docs/reports/*) return 0 ;;
    docs/技术栈选型对抗/*|.scratch/*|.impeccable/*|*/.impeccable/*) return 0 ;;
    */node_modules/*) return 0 ;;
  esac
  return 1
}

while IFS= read -r file; do
  rel="${file#./}"
  progress_allowed "$rel" && continue
  n=$(count_checkboxes "$file")
  base=$(awk -v p="$rel" '$1==p {print $2; exit}' "$progress_baseline" 2>/dev/null || true)
  if [ -z "$base" ]; then
    [ "$n" -gt 0 ] && fail "PROGRESS-SRC" \
      "$rel 有 ${n} 个复选框——进度真相源只有 TODO.md,明细写进 docs/todo/(存量请登记 ${progress_baseline})"
  elif [ "$n" -gt "$base" ]; then
    # ${n} 必须带花括号:后面紧跟全角「——」时,bash 3.2 在 UTF-8 locale 下会把
    # 多字节首字节并进变量名,报 `n?: unbound variable`(canary 首跑当场抓到)。
    fail "PROGRESS-SRC" "$rel 复选框由基线 ${base} 增至 ${n}——并行进度源只许减不许增"
  elif [ "$n" -eq 0 ]; then
    fail "BASELINE" "$rel 已无复选框,请从 $progress_baseline 删除该行(反向棘轮)"
  elif [ "$n" -lt "$base" ]; then
    fail "BASELINE" "$rel 复选框已降至 $n(基线记 $base),请更新 $progress_baseline 收紧棘轮"
  fi
done < <(find . -name "*.md" -type f ! -path "./.git/*" ! -path "*/node_modules/*")

# 基线里指向不存在文件的行必须删
if [ -f "$progress_baseline" ]; then
  while IFS= read -r line; do
    entry="${line%%[[:space:]]*}"
    case "$entry" in ""|\#*) continue ;; esac
    [ -f "$entry" ] || fail "BASELINE" "进度基线条目已不存在: $entry,请从 $progress_baseline 删除"
  done < "$progress_baseline"
fi

# ── 8. 退役物必须带横幅 ──────────────────────────────────────
# 不禁止提及退役组件——历史教训必须能写。要求的是:提到它时**同时说清它已退役**,
# 否则读者(和 AI)会照着一份已死的链路去操作。
# 2026-08-29 实测反例:context/.../web-vitals-reporting.md 的 SOP 写着
# 「查 Loki: {service_name="behavior-service"}」,而 Loki 已 helm uninstall——
# 照做查不到任何数据,且失败方式是「查不到」而非报错,极难归因。
#
# 退役依据(均为 2026-08-29 集群/节点实测):
#   Loki / Jaeger / fluent-bit  集群内零 Deployment,已被 Vector→VictoriaLogs、
#                               VictoriaTraces 取代(docs/TECH.md §9)
#   192.168.3.131               旧网关 LB,已不存在(consumer/consumer-next 均已改指
#                               gateway.dev.test)
#   SeaweedFS                   对象存储目标已撤销,定稿为 Silo(docs/TECH.md §7.1)
#
# 判定:命中行的 ±2 行窗口内、或文件前 10 行(整篇免责横幅)内出现横幅词即放行。
# 只扫**活跃**文档;docs/progress-archive/ 与 docs/reports/ 按定义就是历史,不扫。
while IFS= read -r file; do
  awk -v F="$file" '
    BEGIN{
      RET="Loki|Jaeger|fluent-bit|192\\.168\\.3\\.131|SeaweedFS"
      BAN="存量|退役|历史|迁移期|覆盖|已删除|已停用|不再|已改|旧|撤销|uninstall|孤儿|已迁|不存在"
    }
    { n++; L[n]=$0; if (n<=10) head = head "\n" $0 }
    END{
      for (i=1;i<=n;i++) {
        if (L[i] !~ RET) continue
        win=""
        lo=(i-2<1?1:i-2); hi=(i+2>n?n:i+2)
        for (j=lo;j<=hi;j++) win = win "\n" L[j]
        if (win !~ BAN && head !~ BAN) printf "%s:%d\n", F, i
      }
    }' "$file"
done < <(find context docs/design docs/observability -name "*.md" -type f) | while IFS= read -r hit; do
  fail "RETIRED" "${hit} 提到已退役组件却无「存量/已退役/历史」等横幅——读者会照着死链路操作"
done

# ── 9. 运行时观测值必须带实测日期 ────────────────────────────
# 集群数字写进文档的那一刻都是对的,然后安静地变错——读者无法区分
# 「结构事实」与「某一刻的快照」。2026-08-29 实测到三种坏法同时存在:
#   写错  —— AGENTS.md 说「集群实跑 :dev」,实际 5 种 tag 并存、无一个 :dev
#   过期  —— 文档记的 8/4/5,健康态其实是 5/6/6
#   故障态被当稳态 —— 8/4/5 是 scheduler 崩溃期间的快照,不是文档过期
#
# 对策不是删掉数字(它们解释了很多决策,且删了挡不住下一个 agent 重新写回),
# 而是**强制标注观测时点**:耐久内容是「不变量 + 查法」,数字降级为带日期的注解。
# 写法与三层分类见 context/team/live-facts.md。
#
# 只认三类低歧义的观测值,宁可漏报不可误报(误报会让人关掉门禁):
#   分布      5/6/6 且同行有集群语境词(排除 node101/102/103 这类节点名列表)
#   就绪计数  4/4 Running(排除 1/1 —— 那几乎总是「单副本健康」的通用示例)
#   镜像 tag  sha-xxxxxxx
# 放行:同行/±2 行、或最近的上级标题里出现「实测|实况|快照|观测」+ YYYY-MM-DD。
# 不扫:reports/ progress-archive/ 选型对抗/(按定义就是带日期的历史)、
#      evolution-log(每条自带 ### 日期)、TECH-RADAR(自述历史存档)、
#      experience/(踩坑记录里的数字是症状举例,不是集群观测)。
while IFS= read -r file; do
  awk -v F="$file" '
    BEGIN{
      V1="(^|[^0-9/])[0-9]{1,2}/[0-9]{1,2}/[0-9]{1,2}([^0-9/]|$)"
      CTX1="分布|skew|node10|Pod|副本"
      V2="([2-9][0-9]*|[0-9]{2,})/[0-9]+ *(Ready|Running)"
      V3="sha-[0-9a-f]{7}"
      DATE="20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]"
      WORD="实测|实况|快照|观测"
    }
    { n++; L[n]=$0; if ($0 ~ /^#{1,6} /) H[n]=1 }
    function dated(s){ return (s ~ DATE && s ~ WORD) }
    END{
      for(i=1;i<=n;i++){
        l=L[i]; hit=""
        if (l ~ V1 && l ~ CTX1) hit="分布"
        else if (l ~ V2) hit="就绪计数"
        else if (l ~ V3) hit="镜像tag"
        if (hit=="") continue
        ok=0
        lo=(i-2<1?1:i-2); hi=(i+2>n?n:i+2)
        for(j=lo;j<=hi;j++) if (dated(L[j])) ok=1
        if (!ok) for(k=i;k>=1;k--) if (H[k]) { if (dated(L[k])) ok=1; break }
        if (!ok) printf "%s:%d|%s\n", F, i, hit
      }
    }' "$file"
#      live-facts.md 自身(它是**定义这条规则**的文档,必须引用 5/6/6、4/4 Running
#      这些模式做示例——与 verify-context-canary.sh 故意内含坏样本同理)。
done < <(find AGENTS.md README.md STACK.md TODO.md context docs -name "*.md" -type f \
         | grep -vE 'docs/(progress-archive|reports|技术栈选型对抗)/|evolution-log\.md|TECH-RADAR\.md|/experience/|context/team/live-facts\.md') \
| while IFS='|' read -r loc kind; do
  fail "LIVE-FACT" "${loc} 的${kind}是某一刻的观测值却无实测日期——写法见 context/team/live-facts.md"
done

# ── 汇总 ─────────────────────────────────────────────────────
if [ -s "$violations" ]; then
  echo "verify-context: 发现 $(wc -l < "$violations" | tr -d ' ') 处违规"
  cat "$violations"
  exit 1
fi
echo "verify-context: OK(链接/INDEX 覆盖/frontmatter/experience 格式/evolution-log/预算/并行进度源/退役物横幅/实测日期 全部通过)"
