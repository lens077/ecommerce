#!/usr/bin/env bash
# gen-third-party-notices.sh — 生成 THIRD_PARTY_NOTICES.md:实际链接进制品的第三方依赖及其许可证。
#
# 参照 deepseek-harness 的 scripts/gen-third-party-notices.ts + lefthook「regenerate rather than
# reject」:依赖一变(go.mod / package.json / pnpm-lock.yaml 进暂存区),pre-commit 直接重新生成
# 并 git add,而不是等 CI 红了再补。SBOM(scripts/generate-sbom.sh)是发布链的机器可读清单;
# 本文件是给人看的、随代码走的许可声明,两者来源不同:这里只列**真的被编进制品**的模块——
# 后端用 `go list -deps ./...`(而非 `go list -m all`,后者含大量只在 go.sum 里的间接模块),
# 前端用 `pnpm licenses list`(读 node_modules,含 dev 依赖;不装依赖则跳过前端段并说明)。
#
# 后端许可证识别:读模块缓存里的 LICENSE/LICENCE/COPYING 文件按关键句归类。不引 go-licenses:
# 它按包粒度重新构建全仓,10 个服务实测 >10 分钟跑不完;这里 0.5s。识别不出的标 UNKNOWN,
# copyleft(GPL/LGPL/AGPL/SSPL)与 UNKNOWN 单列在文首「需要人看一眼」段——本脚本只显形不阻断,
# 是否允许由 docs/TECH.md 的选型纪律决定。
#
# 用法:
#   scripts/gen-third-party-notices.sh            # 写 THIRD_PARTY_NOTICES.md
#   scripts/gen-third-party-notices.sh --check    # 只比对:已提交文件与重新生成结果不一致则 rc=1
set -uo pipefail

root=$(git rev-parse --show-toplevel) || { echo "gen-third-party-notices: 不在 git 仓库内" >&2; exit 2; }
cd "$root" || exit 2
out="THIRD_PARTY_NOTICES.md"
mode=${1:-write}
case "$mode" in write|--check) ;; *) echo "用法: $0 [--check]" >&2; exit 2 ;; esac

classify() { # classify <license file> → SPDX-ish id
  local f=$1 head
  head=$(head -c 4000 "$f" | tr '\n' ' ' | tr -s ' ')
  case "$head" in
    *"Apache License"*"Version 2.0"*) echo "Apache-2.0" ;;
    *"Mozilla Public License"*"2.0"*) echo "MPL-2.0" ;;
    *"GNU AFFERO GENERAL PUBLIC LICENSE"*|*"GNU Affero General Public License"*) echo "AGPL-3.0" ;;
    *"GNU LESSER GENERAL PUBLIC LICENSE"*|*"GNU Lesser General Public License"*) echo "LGPL" ;;
    *"GNU GENERAL PUBLIC LICENSE"*|*"GNU General Public License"*) echo "GPL" ;;
    *"Server Side Public License"*) echo "SSPL" ;;
    *"MIT License"*|*"Permission is hereby granted, free of charge"*) echo "MIT" ;;
    *"ISC License"*|*"Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee"*) echo "ISC" ;;
    *"This is free and unencumbered software released into the public domain"*) echo "Unlicense" ;;
    *"Redistribution and use in source and binary forms"*)
      case "$head" in
        *"Neither the name"*|*"names of its contributors"*) echo "BSD-3-Clause" ;;
        *) echo "BSD-2-Clause" ;;
      esac ;;
    *"Boost Software License"*) echo "BSL-1.0" ;;
    *"Creative Commons"*"Zero"*|*"CC0"*) echo "CC0-1.0" ;;
    *) echo "UNKNOWN" ;;
  esac
}

license_file_in() { # license_file_in <dir> → path or empty
  local d=$1 f
  for f in LICENSE LICENSE.md LICENSE.txt LICENCE LICENCE.md LICENCE.txt COPYING COPYING.md License License.md license license.md License.txt NOTICE; do
    [ -f "$d/$f" ] && { echo "$d/$f"; return 0; }
  done
  return 1
}

tmp=$(mktemp -d "${TMPDIR:-/tmp}/tpn.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

# ── 后端:实际编进制品的模块 ──────────────────────────────────────
main_module=$(cd backend && go list -m)
( cd backend && go list -deps -f '{{if .Module}}{{.Module.Path}}{{"\t"}}{{.Module.Version}}{{"\t"}}{{.Module.Dir}}{{end}}' ./... 2>/dev/null ) \
  | LC_ALL=C sort -u \
  | awk -F'\t' -v main="$main_module" '$1 != main && $1 != ""' > "$tmp/go.tsv"
go_rc=${PIPESTATUS[0]}
if [ "$go_rc" != 0 ] || [ ! -s "$tmp/go.tsv" ]; then
  echo "gen-third-party-notices: go list -deps 失败或为空(rc=$go_rc),拒绝生成一份漏掉后端的清单" >&2
  exit 1
fi
: > "$tmp/go.rows"
while IFS=$'\t' read -r path version dir; do
  lic="UNKNOWN"; src="(no license file)"
  if [ -n "$dir" ] && [ -d "$dir" ] && f=$(license_file_in "$dir"); then
    lic=$(classify "$f"); src=$(basename "$f")
  fi
  printf '| `%s` | %s | %s | %s |\n' "$path" "${version:-(replace)}" "$lic" "$src" >> "$tmp/go.rows"
  printf '%s\n' "$lic" >> "$tmp/all.lic"
done < "$tmp/go.tsv"

# ── 前端:pnpm licenses(读 node_modules) ───────────────────────────
fe_note=""
: > "$tmp/fe.rows"
if [ -x frontend/node_modules/.bin/vp ] && ( cd frontend && pnpm licenses list --json >"$tmp/fe.json" 2>/dev/null ); then
  node - "$tmp/fe.json" > "$tmp/fe.rows" <<'EOF'
const fs = require('fs')
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
// 平台专属的二进制包(sharp-libvips-darwin-arm64、*-binding-linux-x64-gnu …)只装当前机器那一份,
// 名字里的平台段归一为 <platform>,否则 macOS 生成、Linux CI --check 必然不一致。
const platform = /-(darwin|linux|win32|android|freebsd|openbsd|sunos|aix)(-[a-z0-9]+)*$/
const seen = new Set()
const rows = []
for (const [license, pkgs] of Object.entries(data)) {
  for (const p of pkgs) {
    const name = p.name.replace(platform, '-<platform>')
    for (const v of p.versions) {
      const key = `${name}@${v}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push([name, v, license === 'Unknown' ? 'UNKNOWN' : license, p.homepage ?? ''])
    }
  }
}
rows.sort((a, b) => (a[0] + '@' + a[1]).localeCompare(b[0] + '@' + b[1], 'en'))
for (const [n, v, l, h] of rows) {
  process.stdout.write(`| \`${n}\` | ${v} | ${l} | ${h ? `<${h}>` : ''} |\n`)
}
EOF
  awk -F'|' '{gsub(/^ +| +$/, "", $4); print $4}' "$tmp/fe.rows" >> "$tmp/all.lic"
else
  fe_note="前端依赖未安装(frontend/node_modules 缺失),本次未生成前端段;\`cd frontend && pnpm install\` 后重新运行。"
fi

# ── 汇总 ───────────────────────────────────────────────────────────
go_n=$(awk 'NF{n++} END{print n+0}' "$tmp/go.rows")
fe_n=$(awk 'NF{n++} END{print n+0}' "$tmp/fe.rows")
attention=$(grep -E '^(UNKNOWN|GPL|LGPL|AGPL|SSPL)' "$tmp/all.lic" | LC_ALL=C sort | uniq -c | awk '{printf "%s×%s ", $2, $1}')

{
  echo "# Third-party notices"
  echo
  echo "由 \`scripts/gen-third-party-notices.sh\` 生成,勿手工编辑;依赖变更进暂存区时 pre-commit 会自动重新生成。"
  echo "后端列出 \`go list -deps ./...\` 实际链接进制品的 ${go_n} 个模块;前端列出 \`pnpm licenses list\` 解析到的 ${fe_n} 个包(含 dev 依赖)。"
  [ -n "$fe_note" ] && { echo; echo "> ⚠️ $fe_note"; }
  echo
  echo "## 需要人看一眼"
  echo
  if [ -n "$attention" ]; then
    echo "识别不出(UNKNOWN)或 copyleft 的条目:${attention}——是否允许见 docs/TECH.md 的选型纪律;UNKNOWN 通常是许可证文件名不在识别列表里,先人工核对再决定要不要扩识别规则。"
  else
    echo "无:所有条目都识别为宽松许可证。"
  fi
  echo
  echo "## 按许可证统计"
  echo
  echo "| 许可证 | 条目数 |"
  echo "|---|---|"
  LC_ALL=C sort "$tmp/all.lic" | uniq -c | sort -rn | awk '{n=$1; $1=""; sub(/^ /, ""); printf "| %s | %s |\n", $0, n}'
  echo
  echo "## 后端(Go 模块,${go_n})"
  echo
  echo "| 模块 | 版本 | 许可证 | 来源文件 |"
  echo "|---|---|---|---|"
  cat "$tmp/go.rows"
  if [ "$fe_n" -gt 0 ]; then
    echo
    echo "## 前端(npm 包,${fe_n})"
    echo
    echo "| 包 | 版本 | 许可证 | 主页 |"
    echo "|---|---|---|---|"
    cat "$tmp/fe.rows"
  fi
} > "$tmp/out.md"

if [ "$mode" = "--check" ]; then
  if [ ! -f "$out" ]; then echo "gen-third-party-notices: $out 不存在,先运行本脚本生成" >&2; exit 1; fi
  if ! diff -q "$out" "$tmp/out.md" >/dev/null; then
    echo "gen-third-party-notices: $out 已过期,运行 scripts/gen-third-party-notices.sh 重新生成并提交" >&2
    diff "$out" "$tmp/out.md" | head -20 >&2
    exit 1
  fi
  echo "gen-third-party-notices: $out 与依赖一致(后端 ${go_n} / 前端 ${fe_n})"
  exit 0
fi

mv "$tmp/out.md" "$out"
echo "gen-third-party-notices: 写入 $out(后端 ${go_n} / 前端 ${fe_n};需关注: ${attention:-无})"
