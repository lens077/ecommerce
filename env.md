ecommerce 环境与文档

    只读检查：
        node0：Docker 29.8.0，blog、newt 运行。
        node1：Docker 29.5.3，Pangolin、Traefik、Casdoor、PostgreSQL、Redis、ntfy 等运行。
        node2：Docker 29.5.2，Gorse、Silo 运行。
        k1/k2/k3：amd64、Ubuntu 26.04.1、kubelet v1.36.4，均 Ready，无节点压力。
        ecommerce Deployment 当前查询均为 desired=ready。
        ArgoCD 当前只观察到 ecommerce-kyverno 为 Synced/Healthy/automated，没有据此推断业务已被 GitOps 接管。
    Repowise 0.52.0 只读审计：
        1,303 个文件、3,156 个符号；
        55 个 unreachable、109 个 unused exports、886 个 health findings；
        高置信度文档 drift 为 0。
        静态结果仅作为清理线索，没有直接删除代码。
    删除的过期/历史文档：
        ecommerce/docs/architecture/ecommerce-gateway.html
        ecommerce/docs/architecture/ecommerce-gateway.architecture.json
        ecommerce/docs/design/payment/payment.md
        ecommerce/docs/design/product/schema.md
        ecommerce/infrastructure/gatus/README.md
    重写或修正了：
        ecommerce/README.md
        ecommerce/README.zh-CN.md
        ecommerce/TODO.md
        ecommerce/STACK.md
        ecommerce/docs/TECH.md
        ecommerce/docs/SECURITY-HARDENING.md
        ecommerce/docs/DEVOPS.md
        ecommerce/infrastructure/ces-audit/README.md
        ecommerce/infrastructure/observability/README.md
        ecommerce/infrastructure/argocd/README.md
        ecommerce/docs/observability/grafana/README.md
        ecommerce/infrastructure/tetragon/README.md
    docs/design/cart/api-decisions.md、docs/learning/、docs/TECH-RADAR.md、docs/SCAFFOLD.md 因仍有决策、教学或模板价值而保留，并明确其不是当前运行真相源。

最终门禁

    scripts/verify-context.sh：通过。
    python3 scripts/verify-doc-sync.py：通过。
    python3 scripts/doc-embed.py --check：12 个代码嵌入块一致。
    python3 scripts/env-check.py --check：通过。
    python3 scripts/test-doc-sync.py：14 项通过。
    python3 scripts/test-env-check.py：8 项通过。
    scripts/verify-repowise.sh：通过。
    git diff --check：通过。

请重点复核 TODO.md 中仍保留的容量、GitOps、灾备和业务闭环缺口，以及完整 GUI 中既有的 3 项 ui-digest 测试失败。
请重点复核 TODO.md 中仍保留的容量、GitOps、灾备和业务闭环缺口，以及完整 GUI 中既有的 3 项 ui-digest 测试失败。