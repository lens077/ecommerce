# canary 探针模板（门禁的门禁）

## 为什么必须搬这一项

源仓记录的两次事故说明问题：

- **commitlint 钩子静默失效九个月**（`frontend/.vite-hooks/commit-msg:1-12`）：钩子文件在，`core.hooksPath` 也设了，
  但分发器不认这个钩子名，于是提交信息从未被校验过。文件存在 ≠ 生效。
- **`verify-freeze.sh` 恒绿十七天**：脚本只在「找不到基线」时才 red，一旦基线存在就永远输出 OK。
  脚本在跑 ≠ 判定有效。

canary 的判据只有一条：**故意注入已知违规，门禁必须变红**。做不到这一点的检查，一律视为「未接线」。

## 结构（取自 `scripts/verify-context-canary.sh:1-25, 345-372`）

```
探针 0：干净沙箱 → 必须绿          ← 证明门禁不会误报
探针 1..N：每个检查一正一负        ← 证明每条断言真的在拦
每条探针：注入 → 跑 → 断言指定 tag → 断言退出码
假阳性守卫：注入的样本本身要能被解析器识别为「违规」
```

关键细节：**断言的是 tag（如 `[PATH-REF]`），不是「退出码非零」**。只断言非零的话，
任何一个无关报错都会让探针假绿。

## 骨架

```bash
#!/usr/bin/env bash
# 门禁元评测：在临时仓里注入已知违规，断言门禁会红。
# 任何一条探针不达预期 → 本脚本本身 red。本脚本永远不该被跳过。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$ROOT/{{GATE_SCRIPT}}"          # 例：scripts/verify-context.sh
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0

# 在沙箱里铺一份最小可绿仓；内容按目标仓的[结构]要求准备
sandbox() {
  local d="$TMP/$1"; mkdir -p "$d"
  # TODO: 复制最小骨架（AGENTS.md / context 各层 INDEX / 基线空文件）
  #       不要复制真实仓库 —— 沙箱必须从「已知绿」出发
  echo "$d"
}

# probe <名称> <注入函数> <期望出现的 tag>
probe() {
  local name="$1" inject="$2" want="$3"
  local d; d="$(sandbox "$name")"
  ( cd "$d" && git init -q . && git add -A && git -c user.email=a@b -c user.name=c commit -qm init )
  "$inject" "$d"
  local out rc
  out="$( cd "$d" && bash "$GATE" 2>&1 )"; rc=$?
  if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q "$want"; then
    pass=$((pass+1)); printf '  ok   %-32s %s\n' "$name" "$want"
  else
    fail=$((fail+1)); printf '  FAIL %-32s 期望 %s，实际 rc=%s\n' "$name" "$want" "$rc"
    printf '%s\n' "$out" | sed 's/^/       /' | head -5
  fi
}

# 探针 0：干净沙箱必须绿（负责任地捕获「门禁永远红」这种反向失效）
clean() { :; }
probe 00-pristine-green clean "" || true   # 单独断言 rc==0，见实现说明

# 每个已启用的检查各来一条；清单必须与 [GATE] 的 tag 集合一一对应
probe dead-link      inject_dead_link      "[DEAD-LINK]"
probe path-ref       inject_missing_path   "[PATH-REF]"
probe orphan         inject_orphan         "[ORPHAN]"
probe frontmatter    inject_bad_frontmatter "[FRONTMATTER]"
probe budget         inject_oversize       "[BUDGET]"
probe baseline-regress inject_baseline_up  "[BASELINE]"
# TODO: 目标仓启用的每一个 tag 都要有对应探针；没探针的检查视为未接线

echo "canary: $pass 通过 / $fail 失败"
[ "$fail" -eq 0 ]
```

## 移植时的三个坑

1. **探针集合必须由「启用中的检查」生成，不能手抄**。源仓 49 个探针里有 2 个对应的检查已被删除，
   成了恒绿死探针——它们让 canary 总数看起来更健康，实际覆盖为 0。
   建议：门禁启动时打印启用 tag 列表，canary 断言「每个 tag 至少一个探针」，缺了就红。
2. **沙箱要能覆盖基线检查**。测 `[BASELINE]` 需要在沙箱里预置一份基线再注入一行新违规，
   否则测的是「第一次跑」路径，不是日常路径。
3. **假阳性守卫**：注入的样本必须能被解析器读到（例如放在被扫描的根目录、用正确的文件后缀）。
   源仓这条守卫抓过一次「探针注入到不扫描的目录，于是恒绿」的事故。

## 最小验收

- 干净沙箱：rc=0
- 每个启用 tag：≥1 条红探针，且输出含该 tag
- 删掉任一检查的判定代码后，对应探针必须转红（证明探针真的在测它）
