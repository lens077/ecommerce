#!/usr/bin/env bash
# 启用 POSIX 模式并设置严格的错误处理机制
set -o posix errexit -o pipefail

# 生成模板
helm template my-release . --debug --values values.yaml

# 更新子chart
helm dependency update
helm dependency build

# 登录
helm registry login harbor.apikv.com

# 打包
helm package .
# 推送
helm push *-*.tgz oci://harbor.apikv.com/sumery

# 创建secret
kubectl create secret generic pg-ca-cert \
  --namespace ecommerce \
  --from-file=pg_ca.crt=./pg_ca_pem.crt

# 安装
helm upgrade --install ecommerce . \
 -f values.yaml \
 -n ecommerce \
 --create-namespace

helm uninstall ecommerce -n ecommerce
