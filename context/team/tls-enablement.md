---
name: tls-enablement
layer: team
description: 给「已经在跑」的服务补 TLS 时的固定检查清单——先判云厂商 ICP 拦截（决定能不能就地上 TLS）、健康检查静默失效、证书挂载遮蔽、IP SAN 缺失、多处部署的续期同步；上 TLS 前必读
---

# 给在跑的服务补 TLS（2026-08-19 MinIO 实付学费）

> 适用范围：TODO.md「基础设施 TLS 收敛」段里所有待办（gorse / casdoor / ES / Kafka / Consul）。
> 这四条不是理论风险，是给 MinIO 上 TLS 时逐条撞到的。

## 0. 先决条件：这台机到底能不能用域名（2026-08-19 白做一轮）

**上 TLS 的前提是能用域名**（公共 CA 不签 IP，见 §3）。但域名能不能用，不只取决于你的 DNS 和证书——
**国内云厂商会按 ICP 备案状态在网络层拦域名访问**。

node2（阿里云 `node2`）实测：`apikv.com` 未在阿里云备案，任何带该域名 Host/SNI 的请求都被拦：

| 访问方式 | 结果 |
|---|---|
| `http://<任意子域>.apikv.com:<任意端口>` | **403**，`Server: Beaver`，body 是 `<title>Non-compliance ICP Filing</title>` + 跳 `aliyun.com/beian/beian-block` |
| `https://<任意子域>.apikv.com:<任意端口>` | **reset**（发完 SNI 就断，插不了拦截页） |
| `http://node2:<端口>`（纯 IP） | **200** 正常 |

**判别法**：纯 IP 通、带域名不通 ⇒ 是备案拦截，不是你的 TLS/DNS/防火墙配错了。

**踩坑经过**：先给 MinIO 就地配好证书、加了 DNS 精确记录，`--resolve` 验证一度返回 200，
于是判定"链路已闭合"——**但那个结果不可复现**，几十分钟后同一条命令返回 000。
拦截系统对新解析的子域有识别延迟，**短窗口内的一次成功不能当作验收通过**。

**结论**：这类机器上的服务，正解不是就地上 TLS，而是**让公网流量落到一台不受拦截的机器（如腾讯云 node1）
再经隧道回来**（做法见 `pangolin-tunnel.md` 的「node2 站点」）。就地配证书那一步是白做的——
但服务端口收回回环仍然有效，别一起回滚。

## 1. 健康检查会静默失效（最容易漏）

**协议从 http 换到 https，健康检查里硬编码的 http 不会跟着变**，而它失败**不会**让容器重启
（restart policy 只管退出码，不管 unhealthy），所以表现是「服务其实是好的，但状态永远 unhealthy」——
或者反过来更糟：探针挂了你却以为是 TLS 没配好，回滚了本来正确的改动。

MinIO 实例：原 healthcheck 是 `mc ready local`，而 `mc` 的 `local` alias 固化为
`http://localhost:9000`（`docker exec minio mc alias list local` 可见）。改法：

```yaml
test: [ "CMD", "curl", "-fsk", "https://localhost:9000/minio/health/live" ]
```

`-k` 是必须的：证书 CN 是对外域名，与 `localhost` 天然不匹配。**上 TLS 前先把健康检查、
k8s 探针、外部监控探测三处的 URL 都找出来**，别只改服务本身。

## 2. 证书整卷挂载遮蔽容器内原目录，且 `:ro` 后无法自建子目录

与 helm `db-ca-cert` 整卷挂 `/etc/ssl/certs` 遮蔽系统 CA 是**同一个坑的两个实例**。

MinIO 的 `/root/.minio/certs/` 下本来有个空的 `CAs/`。整卷挂 `./certs:/root/.minio/certs:ro` 会
遮蔽它；而因为挂了 `:ro`，MinIO 启动时也无法自己把 `CAs/` 建回来。**宿主机侧必须预先 `mkdir -p certs/CAs`**。

一般规律：**整卷挂载前先 `ls -laR` 目标目录**，把原有结构在宿主机侧补齐；能挂单文件就别挂整卷。

**另一半是属主**：容器里的服务多半不是 root 跑的，私钥 `600 root:root` 它读不到，**症状是启动即失败**
（不是 TLS 不生效，是根本起不来）。redis 官方镜像是 uid 999，所以 `chown -R 999:999 tls/`；
MinIO 的 `pgsty/minio` 是 root 所以没这问题。**挂证书前先确认容器的运行用户**：
`docker inspect <c> --format '{{.Config.User}}'`，为空就查镜像文档。

**第三个变量是 `HOME`（2026-08-20 silo 实付学费）**：证书路径除了挂载点和属主，还跟着镜像的
`$HOME` 走。MinIO 谱系默认从 `$HOME/.minio`（silo 为 `$HOME/.silo`）`/certs` 找证书；
`pgsty/silo` 镜像仍以 root 运行但把 `HOME` 从 `/root` 改成了 `/tmp`，挂在 `/root/.minio/certs`
的证书整卷被无声跳过，服务以 HTTP 起来——**不报错、不退出，TLS 静默降级**，症状是健康检查
（https）unhealthy + 公网 500，而 `docker logs` 里服务「一切正常」。**对策**：换镜像/升级镜像时
不依赖默认证书搜索路径，command 显式 `--certs-dir <挂载点>`；**验收第一眼看启动横幅协议**
（`docker logs` 的 `API: https://` 还是 `http://`），再跑 §5 四条。判别命令：
`docker exec <c> sh -c 'id; echo $HOME'` 对比证书挂载点。

**顺带一个非 TLS 但同源的坑**：改这类服务的 compose 往往要 `--force-recreate`，
**没挂数据卷的容器一重建就丢数据**（RDB/本地状态都在可写层）。2026-08-19 就这么丢了 node1 Redis
的 36 个 key。动手前先 `docker inspect <c> --format '{{range .Mounts}}...'` 看数据目录挂没挂。

## 3. 公共 CA 证书不含 IP SAN → 所有 IP 端点配置都要改

ZeroSSL/Let's Encrypt 这类公共 CA **不签 IP**。证书 SAN 只有 `*.apikv.com` + `apikv.com`，
所以上 TLS 后 `https://node2:9000` 必然证书校验失败，**必须整条链路改走域名**：

- 服务配置（本次：`cart` 的 `configs/{dev,pre}.yml` 的 `store.minio`）
- Config Center 的 KV（**与仓库副本是两份，见「三份配置对齐」的教训**）
- DNS：泛解析若指向别的机器，**必须加一条精确 A 记录覆盖它**。
  本次 `*.apikv.com` 泛解析指向 node1，而 MinIO 在另一台，不加 `minio` 的精确记录就落到错误的机器。

顺序是死的：**先加 DNS → 验证 → 再灌 KV**。反过来会让服务热更新到一个解析不到的域名。

## 4. 泛域名证书每多部署一处，续期就多一处会静默挂

`*.apikv.com` 现在是**三处**：`/home/docker/blog/ssl/`、node1 的
`pangolin/config/traefik/certs/`、node2 的 `minio/certs/`。到期日 **2026-10-27**，
而 node1 的自动续期链路是缺位的（`pangolin-tunnel.md:26`）。

**复制证书到新机器时，同时把它登记进续期清单**，否则到期那天是三处一起挂，
且 MinIO 这种「挂了只在浏览器控制台报错」的最难发现。

## 5. 验收：必须包含「故意用错的输入」和「不带 -k 的严格校验」

只测「该通的通了」证明不了任何事——配置没生效时它照样通。固定四条：

```bash
# ① 该关的真的关了(期望 000,不是 200/403)
curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://<ip>:<管理端口>/
# ② 旧的明文端点确实失效
curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://<ip>:<port>/<health>
# ③ 新的 TLS 端点可用
curl -sk -m 8 -o /dev/null -w "%{http_code}\n" https://<ip>:<port>/<health>
# ④ 关键:不带 -k 的严格校验,且用真实域名(DNS 未就绪时用 --resolve 强制指向)
curl -s -m 10 -o /dev/null -w "%{http_code}\n" \
  --resolve <域名>:<port>:<ip> https://<域名>:<port>/<health>
```

只有 ④ 能同时证明**证书链完整**（缺中间证书时这条会挂而 ③ 不会）、**域名匹配**、**公共 CA 可信**。

**顺手改的密码，也要用新密码实测一次**。2026-08-19 给 Redis 写 `requirepass` 时用了
`cat > conf <<EOF ... requirepass "\$PW"`——**未加引号的 heredoc 里 `\$` 会转义成字面量**，
配置里落的是 `requirepass "$PW"` 这四个字符，等于把密码设成了 `$PW`。
生成密码的那条命令回显完全正常，`grep` 出来也"看着像配好了"（值被自己的脱敏 sed 盖掉了），
**只有用新密码真连一次才会暴露**。要么用 `<<'EOF'` + 后续替换，要么直接用 python 写文件绕开 shell 插值。

> 附带的工具教训：`/dev/tcp/<host>/<port>` 探测端口在本机沙箱里会**对所有端口报 closed**，
> 包括明明能通的。**任何探测法先用一个已知结果的对照组验证它自己**，否则会得出「全部端口不通」
> 这种把人带偏的结论。curl 不受影响。
