#!/usr/bin/env bash
# id: secrets
# tag: SECRETS
# desc: 已提交文件里不得出现明文凭据；gitleaks 可用时再叠一层历史扫描
# fast: 1
# config: HARNESS_GITLEAKS

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || { h_pass "非 git 仓库，跳过"; exit 0; }

# 内置特征：零依赖，只覆盖最常见的几类误入库。
hits=$(cd "$REPO_ROOT" && git grep -InE -e '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|(password|passwd|secret|api[_-]?key|token)[[:space:]]*[:=][[:space:]]*"[^"]{8,}"' -- . 2>/dev/null || true)
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  h_fail SECRETS "$hit"
done <<< "$hits"

case "$HARNESS_GITLEAKS" in
  off) ;;
  optional|required)
    if command -v gitleaks >/dev/null 2>&1; then
      rc=0
      out=$(cd "$REPO_ROOT" && gitleaks git . --no-banner --redact=80 2>&1) || rc=$?
      if [ "$rc" -ne 0 ]; then
        while IFS= read -r l; do
          [ -z "$l" ] && continue
          h_fail SECRETS "gitleaks: $l"
        done < <(printf '%s\n' "$out" | tail -5)
        h_fail SECRETS "gitleaks 历史扫描失败（rc=$rc）"
      fi
    elif [ "$HARNESS_GITLEAKS" = required ]; then
      h_fail SECRETS "HARNESS_GITLEAKS=required 但 gitleaks 不在 PATH（fail-closed）"
    else
      h_note "gitleaks 未安装：只跑了内置特征（optional）"
    fi
    ;;
esac

[ "$H_FAILS" -eq 0 ] && h_pass "无明文凭据"
[ "$H_FAILS" -eq 0 ]
