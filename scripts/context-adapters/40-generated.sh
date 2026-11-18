#!/usr/bin/env bash
# id: generated
# tag: GENERATED
# desc: 告警规则正文与自带摘要一致（生成器 --verify-body）
# config: 无
#
# 本仓专属：生成器 scripts/generate-alerting-catalog.py 只用标准库抓手改，
# 抓不到同级 kubernetes 仓的源码漂移——那条边界写在该文档的「再生成与漂移检查」段。

. "$HARNESS_KIT/lib/util.sh"
H_FAILS=0

if ! generated_output=$(python3 scripts/generate-alerting-catalog.py --verify-body 2>&1); then
  h_fail GENERATED "$generated_output"
fi

[ "$H_FAILS" -eq 0 ] && h_pass "生成区未被手改"
[ "$H_FAILS" -eq 0 ]
