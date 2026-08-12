---
name: pangolin-tunnel
layer: team
description: 公网暴露基础设施(Pangolin)的拓扑事实、面板 API 操作模式、k8s HTTPRoute 暴露套路与已知坑——对外公开任何内网服务前必读
---

# Pangolin 内网穿透 / 公网暴露(2026-08-08 部署)

> 人类速查版(纯命令)在仓库根 [`ai-helper.sh`](../../ai-helper.sh) 的 Pangolin 小节;
> 本文件是 AI 操作用的完整事实与接口。**凭据一律不写值,只写位置**(runbook §0 硬规则)。

## 拓扑

```
公网用户 ──HTTPS/TCP/UDP──> node3 VPS(ssh 别名 node3,hostname 显示 node1,114.132.233.129,腾讯云)
                              Pangolin CE 1.21.1 + Gerbil 1.4.3 + Traefik v3.7,目录 /home/docker/pangolin/
                              │ WireGuard(UDP 51820/21820,内网侧纯出站)
              ┌───────────────┼───────────────────┐
        Mac(newt 1.15.0)   k8s 集群(helm newt)   [blog 容器:同机,不走隧道]
        ~/apps/newt/         ns pangolin           站点资源 apikv.com/www → https://blog:443
```

- 实例身份:腾讯云**轻量应用服务器 Lighthouse** `lhins-1of5dkfj`(ap-guangzhou-7),不是 CVM——防火墙是 Lighthouse 实例防火墙(`tccli lighthouse DescribeFirewallRules/DeleteFirewallRules --InstanceId`),没有安全组;TAT 助手在线,`tccli tat RunCommand` 可免 SSH 执行命令(带外救援通道,2026-08-11 实测可用);SSH 端口 34123(22/3389 已从防火墙移除)
- 域名 `apikv.com`,**DNS 在 DNSPod(不是 Cloudflare)**,已有 `*` 泛解析 → 114.132.233.129;新子域**零 DNS 操作**
- 泛域名证书 ZeroSSL `*.apikv.com`(acme.sh dns_dp 签),**2026-10-27 到期**;部署在两处:`/home/docker/blog/ssl/`(原件)与 node3 `/home/docker/pangolin/config/traefik/certs/apikv.com.{crt,key}`,**续期要同步两处**
- k8s:node1-3 = 192.168.3.105-107(与办公内网同段),Cilium Gateway API,`cilium-gateway`(ns default,LB 192.168.3.110,ClusterIP **10.97.94.118**)
- 另一台公网机 8.138.194.254 跑 harbor/img(与 Pangolin 无关);`auth.apikv.com` 解析已指 node3(casdoor:8000 未暴露,要用时面板一键)

## 面板与站点/资源现状

- 面板 `https://pangolin.apikv.com`,管理员 `admin@apikv.com`(密码在用户处),org `main`
- Sites:`node3-local`(siteId 1, local)/ `mac`(siteId 2, newt)/ `k8s`(siteId 3, newt)
- Resources:`apikv.com`+`www`(blog,SSO off)/ `config.apikv.com`(SSO on)/ `config-api.apikv.com`(SSO off,应用自带鉴权)
- k8s newt:helm release `newt`(ns `pangolin`,chart `fossorial/newt`);凭据看 `helm get values newt -n pangolin`(inline,勿把 values 文件提交入库)
- Mac newt:`~/apps/newt/newt` + 同目录 launchd plist(含凭据,在仓库外);日志 `/tmp/newt.log`

## 面板 API 操作模式(无需浏览器)

所有写操作带两个 header:`Content-Type: application/json` 和 **`X-CSRF-Token: x-csrf-protection`**(固定值)。

```bash
U=https://pangolin.apikv.com/api/v1
# 登录存 cookie(密码问用户,勿写盘勿入库)
curl -s -c /tmp/pg.ck -X POST $U/auth/login -H "Content-Type: application/json" \
  -H "X-CSRF-Token: x-csrf-protection" -d '{"email":"admin@apikv.com","password":"<ASK-USER>"}'
```

常用端点(1.21.1 实测;body 见 `server/routers/*/create*.ts` 的 zod schema):
- `PUT /org/main/resource` `{name,subdomain,domainId:"domain1",mode:"http"}`(subdomain null = 根域)
- `PUT /resource/:rid/target` `{siteId,ip,port,method,enabled:true}`
- `POST /resource/:rid` `{sso:false}` 关登录保护(新资源**默认有保护**)
- `POST /target/:tid` 更新 target(**siteId 和 ip 必传**,只传 port/method 会校验失败)
- `GET /org/main/pick-site-defaults` 生成新 site 的 newt 凭据
- 注意 Traefik 动态配置 **5s 轮询**,改完等 ≥6s 再验证,别把时序当故障

## k8s HTTPRoute 暴露套路(两步,已验证)

1. HTTPRoute `hostnames` **追加** `xxx.apikv.com`(保留原 `*.app.com`,增量可回退):
   `kubectl patch httproute <name> -n <ns> --type=json -p='[{"op":"add","path":"/spec/hostnames/-","value":"xxx.apikv.com"}]'`
2. 面板建资源:subdomain `xxx`,site `k8s`,target **`10.97.94.118:443` 走 https**

**坑(2026-08 实付学费)**:本仓的 HTTPRoute parentRef 都带 `sectionName: https` → 路由只挂 443 listener,
**80 上无任何路由,envoy 对一切 Host 返 404**。target 走 80 会 404;必须 443/https(Gateway 用自签
`global-default-tls`,Traefik 已配 `serversTransport.insecureSkipVerify` 兼容)。
判别 404 来源:响应头 `server: envoy` + 直连 svc ClusterIP 对比。

## local site(node3-local) 的 target 写法(2026-08-11 与 08-12 两次 kaneo 502 实付学费)

**根源只有一条**:转发是从 **Traefik 容器**发起的,所以 target 必须写「Traefik 容器视角下能到达该服务的地址」,
而不是「服务自己监听时用的地址」。**监听地址 ≠ 目的地址**——这两次都栽在把前者当后者填。

| 写法 | 结果 | 为什么 |
|---|---|---|
| `10.1.0.8:<port>` | ✅ 唯一正确(宿主端口服务) | 宿主内网 IP,服务需监听 0.0.0.0 |
| 容器名`:<port>` | ✅ 正确(容器接入 `pangolin_frontend` 网络后) | blog 模式,连宿主端口都不用发布 |
| `localhost` / `127.0.0.1` | ❌ 快 502 | 是 Traefik **容器自己**,里面没有该端口(2026-08-11 踩) |
| `0.0.0.0` | ❌ 快 502 | **监听地址不是目的地址**,语义同上(2026-08-12 踩) |
| 公网 IP `114.132.233.129` | ⚠️ 绕公网再回来 | 多一跳,且可能被防火墙挡 |

### 地址怎么查(别猜,也别从 `docker ps` 抄)

```bash
# ① 宿主内网 IP —— 写 local site target 就用它。原理:问内核「发往公网时用哪个源地址」
ip route get 1 | awk '{print $7; exit}'        # node3 → 10.1.0.8
hostname -I | awk '{print $1}'                 # 备选

# ② 容器在哪些网络上、各自什么 IP —— 判断能不能走容器名
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}' <容器名>
#   含 pangolin_frontend → target 写容器名(blog 模式)
#   不含               → 只能走宿主端口 + 10.1.0.8
```

实测(2026-08-12):`blog`/`pangolin` 都在 `pangolin_frontend`,而 `kaneo-kaneo-1` 在
`kaneo_default`(172.28.0.3)——**跨网络,Traefik 到不了它的容器 IP**,所以 kaneo 只能走宿主端口。

⚠️ **`docker ps` 的 PORTS 列不能直接抄进 target**(2026-08-12 就是这么错的):

```
kaneo-kaneo-1        0.0.0.0:5173->5173/tcp     ← 0.0.0.0 是【宿主的监听地址】
mediamtx-mediamtx-1  10.1.0.8:8889->8889/tcp    ← 这种才只绑内网
```

看到 `0.0.0.0:5173` 的正确解读是「宿主每个 IP 都能访问 5173,**包括 10.1.0.8**」,
不是「目的地址是 0.0.0.0」。**容器 IP 重启会变,永远别写死** —— 要么容器名,要么宿主 IP。

> 顺带:`0.0.0.0:5173` 意味着该端口也暴露在公网 IP 上(仅靠云防火墙未放行兜底)。
> 收紧写法是 compose 里写 `"10.1.0.8:5173:5173"`,Pangolin 侧不受影响。

### 排错

**快 502(<0.5s)= refused = target 写错或后端没起;慢 502(数秒)= 网络不通。** 先看耗时再排查,能省一半时间。
分层核对顺序:①容器 `docker ps` 是否 healthy → ②宿主 `curl http://10.1.0.8:<port>` 是否 200 → ③下面那条后门看实际 target。
两步都正常而外部 502,就一定是 target。
- 排查 target 实际值不用登面板:宿主 `curl http://<pangolin容器IP>:3001/api/v1/traefik-config` 直接看 services 的 url
- 面板不可用/无密码时可直改 `/home/docker/pangolin/config/db/db.sqlite` 的 `targets` 表(python3 自带 sqlite3,**先 cp 备份**),Pangolin 不缓存,Traefik 5s 轮询内生效

## 其它操作事实

- **raw TCP/UDP**:入口已预留 30001/30002(tcp)、30003(udp)——compose 的 gerbil ports + Traefik entryPoints(命名必须 `tcp-30001` 格式)+ 腾讯云安全组三处一致才通;扩端口要改前两处并 `docker compose up -d --force-recreate gerbil traefik`(共享 netns,一起重建)
- **性能**:Mac/k8s 的 newt 是用户态 netstack(低流量够用);Linux 高吞吐场景加 `USE_NATIVE_MAIN_INTERFACE=true` + NET_ADMIN 切内核 WireGuard,验证:`wg show` 能看到接口才是内核态
- **blog 回滚**(它已无宿主端口,挂在 pangolin_frontend 网络):恢复 `/home/docker/blog/compose.yml.bak` 并停 pangolin 即回到部署前
- 面板证书状态永远 pending 是 BYO 证书的已知显示问题(上游 #3243),以浏览器实际握手为准
- WireGuard 全走 UDP;若运营商晚高峰 QoS 严重,fallback 是 frp(TCP)换隧道层
- DNSPod API 凭据(DP_Id/DP_Key)在 node3 `/root/.bash_history`(用户签证书时 export 过);泛解析已加,一般不再需要
