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

## dry-run 必须覆盖全部写路径

部署脚本不能只给最后一条业务清单 `apply` 加 `--dry-run`。namespace、Secret、ConfigMap
等前置资源如果仍走裸 `kubectl apply/create`，命令即使标成 `DRY_RUN=1` 也会真实修改集群。

把写入子命令收敛为始终非空的数组，并让所有写路径复用它：

```bash
kubectl_apply_cmd=(apply)
if [[ -n "${dry_run}" ]]; then
  kubectl_apply_cmd+=(--dry-run=server)
fi

kubectl create secret generic example --dry-run=client -o yaml |
  kubectl "${kubectl_apply_cmd[@]}" -f -
```

验收 dry-run 时逐条枚举脚本内的 `apply`、`create`、`delete`、`patch`、`replace`、`rollout`
等写操作；每一条都必须进入同一个 dry-run 分支，不能以“资源通常已经存在”为理由跳过。
