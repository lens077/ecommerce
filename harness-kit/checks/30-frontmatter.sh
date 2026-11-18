#!/usr/bin/env bash
# id: frontmatter
# tag: FRONTMATTER
# desc: context 下的文档要有 frontmatter，name 与文件名一致；layer/module 若声明必须与路径一致
# config: HARNESS_LAYERS HARNESS_NESTED_LAYER
#
# layer 只校验「写了就必须对」，不强制出现：有的仓库靠目录表达层级，不重复写进 frontmatter。
# 配了 HARNESS_NESTED_LAYER 时，module: 必须等于路径里的模块目录。

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
  module=$(h_fm_scalar "$file" module)
  desc=$(h_fm_scalar "$file" description)
  stem=$(basename "$file" .md)
  rel=${file#context/}
  want_layer=${rel%%/*}

  [ -n "$name" ] || h_fail FRONTMATTER "$file 缺 name"
  [ -n "$desc" ] || h_fail FRONTMATTER "$file 缺 description"
  [ -z "$name" ] || [ "$name" = "$stem" ] || \
    h_fail FRONTMATTER "$file 的 name=$name 与文件名 $stem 不一致"

  # 路径推导出的期望层级：普通层就是首段目录；嵌套层是 <层>/<项目>/<模块>。
  want_module=""
  if [ -n "$HARNESS_NESTED_LAYER" ] && [ "$want_layer" = "$HARNESS_NESTED_LAYER" ]; then
    rest=${rel#*/}
    project=${rest%%/*}
    rest=${rest#*/}
    [ "$rest" = "$project" ] && rest=""
    module_dir=${rest%%/*}
    if [ -n "$module_dir" ]; then
      want_layer="$HARNESS_NESTED_LAYER/$project/$module_dir"
      want_module=$module_dir
    else
      want_layer="$HARNESS_NESTED_LAYER/$project"
    fi
  fi

  if [ -n "$layer" ] && [ "$layer" != "$want_layer" ]; then
    h_fail FRONTMATTER "$file 的 layer=$layer 与路径推导 $want_layer 不一致"
  fi
  if [ -n "$module" ]; then
    if [ -z "$want_module" ]; then
      h_fail FRONTMATTER "$file 声明了 module=$module，但路径不在 <$HARNESS_NESTED_LAYER>/<项目>/<模块>/ 下"
    elif [ "$module" != "$want_module" ]; then
      h_fail FRONTMATTER "$file 的 module=$module 与路径模块 $want_module 不一致"
    fi
  fi
done < <(find context -name '*.md' -type f | LC_ALL=C sort)

[ "$H_FAILS" -eq 0 ] && h_pass "frontmatter 合规"
[ "$H_FAILS" -eq 0 ]
