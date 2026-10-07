# config-guard

把 `observability.metric.guard`(指标导出退避/熔断/ntfy 告警)写进 Config Center 的
`bootstrap.yaml`,或写进本机被 gitignore 的 `configs/<env>.yml`。

适用于十个后端服务:kit `go-connect-kit@v0.8.0` 起指标管道默认带保护,阈值与 ntfy
参数由这里下发的配置覆盖,不必改代码。

## 顺序不能反

1. **本仓提交** `services/*/configs/bootstrap.schema.json`(必须已含 `guard` 字段)。
   control-tower 的 `scripts/sync-ecommerce-schemas.sh` 检测到 schema 有未提交改动会直接退出。
2. **control-tower 同步并发布 config 服务**:`make sync-ecommerce-schemas` → 提交 →
   构建镜像 → 发布。配置中心以 `CONFIG_SCHEMA_MODE=enforce` 运行,旧快照的
   `additionalProperties=false` 会把 `guard` 当未知键拒绝(HTTP 400)。
3. **消费服务先带上含 `guard` 字段的二进制**(kit ≥ v0.8.0)再写配置。旧二进制开了
   `ErrorUnused`,配置里出现未知键会让它在下次重启时起不来——这一步的代价是 CrashLoop,
   不是「配置不生效」。
4. 再用本工具写配置:先 `-local` 验本地,再 dev,最后按环境推广。

```bash
cd backend && make conf-schema          # 改了 conf.proto 才需要
cd ../control-tower && make sync-ecommerce-schemas
```

## 凭据

只从环境变量读,不落盘、不进仓库:

| 变量 | 用途 |
|---|---|
| `CONFIG_CENTER_TOKEN` | Casdoor **管理员** JWT;`PutKey` 不接受 machine token |
| `NTFY_URL` / `NTFY_TOPIC` / `NTFY_TOKEN` | 告警主题,写进 `guard.ntfy` |

远程模式建议把四个变量放进仓库外的文件(例如 `~/.config/ecommerce/otelguard.env`),
用 `set -a; . ~/.config/ecommerce/otelguard.env; set +a` 载入,避免出现在 shell 历史与
进程列表之外的地方。

## 用法

```bash
cd backend

# 1) 本地(改 gitignore 的 configs/dev.yml),先看会写什么
go run ./tools/config-guard -local -environment dev -services all

# 2) 确认后写入本地
go run ./tools/config-guard -local -environment dev -services all -apply

# 3) 配置中心 dry-run:GetKey 拿现网 YAML,只插入 observability.metric.guard
go run ./tools/config-guard -environment dev -services all

# 4) 写入(每个服务 PutKey 一次,带变更备注,配置中心留版本历史)
go run ./tools/config-guard -environment dev -services all -apply
```

常用参数:`-services order,cart`(默认 `all`)、`-max-failures 4`、`-probe-interval 1m`、
`-disable`(写入 `enable: false`,显式关掉保护)、`-base`(默认 `https://config-api.apikv.com`)。

工具不发明结构:配置里没有 `observability.metric` 段时直接报错,不会替你造一个。
写入前打印将变的 guard 段,`-apply` 才落盘。

## 回滚

配置中心保留版本历史:出问题先看 `ListRevisions`,用 `Rollback` 回到上一版,或再跑一次
本工具把 `-disable`(即 `enable: false`)写回去。本地模式直接 `git checkout` 不适用
(dev.yml 被 gitignore),需要备份就先复制一份。
