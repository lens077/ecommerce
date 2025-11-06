#!/bin/bash
set -x
# 添加helm repo
# https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd_repo_add/
argocd repo add harbor.apikv.com:5443 \
  --name oci-helm-registry \
  --username rebot@github \
  --password 6hDa7T0gPa6Rf4pkSbdZP4x9kjSC0POI \
  --type helm \
  --enable-oci \
  --insecure-skip-server-verification

argocd repo add harbor.apikv.com:5443/sumery \
  --name oci-helm-registry \
  --username rebot@github \
  --password 6hDa7T0gPa6Rf4pkSbdZP4x9kjSC0POI \
  --type helm \
  --enable-oci \
  --insecure-skip-server-verification

# 创建应用
# https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd_app_create/
ARGOCD_APP_NAME="connect-example-frontend"
PROJECT_PATH="sumery"
CHART_NAME="frontend"
argocd app create ${ARGOCD_APP_NAME} \
  --repo harbor.apikv.com:5443/${PROJECT_PATH} \
  --helm-chart ${CHART_NAME} \
  --revision 1.4.9 \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace connect-example \
  --sync-policy automated \
  --self-heal \
  --helm-set frontend.image.tag=1.4.9 \
  --helm-pass-credentials \
  --upsert

ARGOCD_APP_NAME="connect-example-backend"
PROJECT_PATH="sumery"
CHART_NAME="backend"
argocd app create ${ARGOCD_APP_NAME} \
  --repo harbor.apikv.com:5443/${PROJECT_PATH} \
  --helm-chart ${CHART_NAME} \
  --revision 1.4.9 \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace connect-example \
  --sync-policy automated \
  --self-heal \
  --helm-set backend.image.tag=1.4.9 \
  --helm-pass-credentials \
  --upsert

set +x
