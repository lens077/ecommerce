#!/usr/bin/env bash
# id: env-contract
# tag: ENV-CONTRACT
# desc: local-env 工具链生成块与 go.mod/package.json 相等（离线）
# config: 无
#
# 本仓专属：生成块的位置与「离线、不读凭据、不连集群」的边界写在
# scripts/env-check.py 与 context/team/local-env.md 里。退出码即判定。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

if ! env_output=$(python3 scripts/env-check.py --check 2>&1); then
  h_fail ENV-CONTRACT "$env_output"
fi

[ "$H_FAILS" -eq 0 ] && h_pass "工具链契约与源码一致"
[ "$H_FAILS" -eq 0 ]
