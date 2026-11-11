---
name: local-env
layer: team
description: 环境与工具的查法；不记录版本号与「装没装」
---
# 本地环境怎么查

文档只留**契约与查法**，不记版本号、不记「已安装 / 缺失」——它们是运行态，写入当天就开始过期。

```bash
command -v git python3            # 必需
python3 -V
go version                        # 若项目用 Go；版本以 go.mod 的 go 指令为准
node -v && pnpm -v                # 若项目用 Node；版本以 package.json 的 packageManager 为准
```

缺失时按项目包管理器安装；装完只验证版本，不顺带部署、推送或迁移数据库。

故障现场的证据（日志、临时状态）不能当稳态基线写进本节。
