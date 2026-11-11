#!/usr/bin/env bash
# id: frontmatter
# tag: FRONTMATTER
# desc: context 下的文档要有 frontmatter，name 与文件名一致、layer 与目录一致、affects 路径存在
# config: HARNESS_LAYERS

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

[ -d "$REPO_ROOT/context" ] || { h_pass "无 context/，跳过"; exit 0; }

while IFS= read -r file; do
  case "$(basename "$file")" in INDEX.md) continue ;; esac
  if [ "$(head -1 "$file")" != "---" ]; then
    h_fail FRONTMATTER "$file 缺 frontmatter（首行应为 ---）"
    continue
  fi
  name=$(h_fm_scalar "$file" name)
  layer=$(h_fm_scalar "$file" layer)
  desc=$(h_fm_scalar "$file" description)
  stem=$(basename "$file" .md)
  rel=${file#context/}
  want_layer=${rel%%/*}

  [ -n "$name" ] || h_fail FRONTMATTER "$file 缺 name"
  [ -n "$layer" ] || h_fail FRONTMATTER "$file 缺 layer"
  [ -n "$desc" ] || h_fail FRONTMATTER "$file 缺 description"
  [ -z "$name" ] || [ "$name" = "$stem" ] || \
    h_fail FRONTMATTER "$file 的 name=$name 与文件名 $stem 不一致"
  [ -z "$layer" ] || [ "$layer" = "$want_layer" ] || \
    h_fail FRONTMATTER "$file 的 layer=$layer 与所在目录 $want_layer 不一致"

  while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in
      /*|*'*'*|*'?'*) h_fail FRONTMATTER "$file affects: '$p' 必须是仓库相对路径且不含 glob"; continue ;;
    esac
    [ -e "$REPO_ROOT/$p" ] || h_fail FRONTMATTER "$file affects: '$p' 不存在"
  done < <(h_fm_list "$file" affects)
done < <(find "$REPO_ROOT/context" -name '*.md' -type f | sed "s#^$REPO_ROOT/##" | LC_ALL=C sort)

[ "$H_FAILS" -eq 0 ] && h_pass "frontmatter 合规"
[ "$H_FAILS" -eq 0 ]
