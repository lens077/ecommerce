---
name: shell-scripting
layer: team
description: 仓库脚本兼容 macOS Bash 3.2 时的最低约束
---

# Shell 脚本兼容性

## `set -u` 与空数组

仓库脚本必须兼容 macOS 自带的 Bash 3.2。该版本在 `set -u` 下展开空数组
`"${args[@]}"` 会报 `unbound variable`，即使之前已经执行过 `args=()`。

可选参数不要用「可能为空的数组 + 无条件展开」。优先让数组始终包含一个真实参数，
再按条件追加可选参数：

```bash
kubectl_delete_cmd=(delete)
if [[ -n "${dry_run}" ]]; then
  kubectl_delete_cmd+=(--dry-run=server)
fi
kubectl "${kubectl_delete_cmd[@]}" -f manifest.yaml
```

验收脚本时不能只看静态清单渲染；至少覆盖一次可选参数为空的默认路径，并在 macOS
Bash 3.2 或等价兼容环境中执行。否则 dry-run 分支能工作，不带参数的真实入口仍可能在
第一条命令前退出。
