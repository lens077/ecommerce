---
name: config-center-self-bootstrap-blindspot
module: config
description: 基础设施切换排查消费者时漏掉 Config Center 自举配置——它不在 config.entry 里，且老 pod 靠内存配置掩盖 CC 已死，任何全量重启都会引爆
---

# 滚动重启后十服务全体 CrashLoop：dial config-center 30010 connection refused

**症状**

缓存从 redis 切到 dragonfly（2026-08-20）：Config Center 里 10 份 pre bootstrap 已全部
host-only 替换、本地副本同步、随后 `kubectl -n ecommerce rollout restart deploy`——
新一代 pod **全体** CrashLoop，包括根本不用缓存的服务；日志第一行：
`read config center key cart/pre/bootstrap.yaml: unavailable: dial tcp 10.110.154.50:30010: connect: connection refused`。

**关键陷阱**

两层掩盖叠加：

1. **老 pod 用内存里的配置活着**：服务只在启动时读 CC，CC 死了在跑的 pod 毫无感知。
   CC 实际早已 NotReady（readiness 503 → svc 零端点），但集群表面一切正常——
   直到任何一次全量重启把隐雷引爆。切换类操作前必须先看
   `kubectl -n config-center get pods` 的 READY 列。
2. **排查「谁在消费 X」时 SQL 只扫了 `config.entry`**：
   `SELECT ... WHERE value LIKE '%redis.redis.svc%'` 找到 10 个服务，唯独漏掉
   **Config Center 自己**——它的 Bootstrap 不在表里，而在
   `config-center` ns 的 Secret `config-center-bootstrap`（`CONFIG_FILE` 自举，
   见本目录 INDEX「已知注意事项」第一条）。CC 的 healthz 聚合缓存状态，
   redis 一关停它就 503。

**根因**

CC 也是 redis 消费者（cache + presence 段）。redis `scale 0` 后 CC healthz 503 →
readiness 摘除 → svc 无端点 → 所有需要重新 bootstrap 的 pod 起不来。

**修法与防再发**

- 修复：同样对 Secret 里的 `config.yaml` 做 host-only 替换
  （`kubectl get secret ... | base64 -d | sed | kubectl apply`），重启 CC 即全线恢复。
- **防再发清单**：凡是替换/关停基础设施（PG/Redis/ES/MinIO/Consul…），消费者盘点 =
  `config.entry` 扫描 **+ `config-center-bootstrap` Secret + 网关 Config Center 四键**
  三处都查；关停旧件前先确认新件已被 CC 自身接受（CC READY 1/1）。
- 同型事故：casdoor 收编（TODO ⑧）与去 Consul（TODO ⑤）执行时照此清单。
