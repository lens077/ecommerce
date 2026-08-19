---
name: pangolin-tunnel
layer: team
description: 公网暴露基础设施(Pangolin)的拓扑事实、面板 API 操作模式、k8s HTTPRoute 暴露套路与已知坑——对外公开任何内网服务前必读
---

# Pangolin 内网穿透 / 公网暴露(2026-08-08 部署)

> 人类速查版(纯命令)在仓库根 `ai-helper.sh` 的 Pangolin 小节(本机文件,已 gitignore 不入库,fresh clone 没有);
> 本文件是 AI 操作用的完整事实与接口。**凭据一律不写值,只写位置**(runbook §0 硬规则)。

## 拓扑

```
公网用户 ──HTTPS/TCP/UDP──> node1 VPS(ssh 别名 node1,与 hostname 一致;旧称 node3 已于 2026-08-18 统一弃用,114.132.233.129,腾讯云)
                              ⚠️ 与本地 k8s 集群的 node1(192.168.3.105)重名:本文的 node1 均指这台公网 VPS
                              Pangolin CE 1.21.1 + Gerbil 1.4.3 + Traefik v3.7,目录 /home/docker/pangolin/
                              │ WireGuard(UDP 51820/21820,内网侧纯出站)
              ┌───────────────┼───────────────────┐
        Mac(newt 1.15.0)   k8s 集群(helm newt)   [blog 容器:同机,不走隧道]
        ~/apps/newt/         ns pangolin           站点资源 blog.apikv.com → https://blog:443
```

- 实例身份:腾讯云**轻量应用服务器 Lighthouse** `lhins-1of5dkfj`(ap-guangzhou-7),不是 CVM——防火墙是 Lighthouse 实例防火墙(`tccli lighthouse DescribeFirewallRules/DeleteFirewallRules --InstanceId`),没有安全组;TAT 助手在线,`tccli tat RunCommand` 可免 SSH 执行命令(带外救援通道,2026-08-11 实测可用);SSH 端口 34123(22/3389 已从防火墙移除)
- 域名 `apikv.com`,**DNS 在 DNSPod(不是 Cloudflare)**,已有 `*` 泛解析 → 114.132.233.129;新子域**零 DNS 操作**
- 泛域名证书 ZeroSSL `*.apikv.com`(acme.sh dns_dp 签),**2026-10-27 到期**;部署在两处:`/home/docker/blog/ssl/`(原件)与 node1 `/home/docker/pangolin/config/traefik/certs/apikv.com.{crt,key}`,**续期要同步两处**。**⚠️ 自动续期链路缺位(2026-08-18 实查)**:node1 上 acme.sh 只剩 `/usr/local/bin/acme.sh` 单文件,`/root/.acme.sh/` 无证书产物、domain conf 未存 DNSPod 凭据、root crontab 无续期条目——10-27 会硬过期,需在此前手动重签或重建续期链路(DNSPod 旧 Key 已作废,要用轮换后的新 Key 或腾讯云子账号走 dns_tencent)
- k8s:**集群已于 2026-08 重建**,现为 node1 `192.168.3.201` / node2 `192.168.3.202`(control-plane),
  Cilium Gateway API,`cilium-gateway`(ns default,LB **192.168.3.100**,ClusterIP **10.99.145.85**)。
  ⚠️ 下文「k8s HTTPRoute 暴露套路」里的 target `10.97.94.118:443` 是**旧集群的 ClusterIP,已失效**,
  要用上面的新值。
  **2026-08-19 newt 已重装并实测打通**:新建站点 `k8s-cluster`(siteId 4,online=true),
  旧站点 `k8s`(siteId 3)保留但**永久不可用** —— 它的 secret 面板不回显、旧集群的
  helm values 已随集群消失,拿不回来了(建站点那一刻的回显是唯一一次)。
  newt 现由 **kubernetes 仓的 `components/newt/`** 管理(manifest 安装,不是 helm ——
  上游 `https://fosrl.github.io/newt` 实测 404,没有可用 chart 仓库),凭据存
  `creds/newt-{id,secret}` 不入库。资源 3/4(config/config-api)的 target 已从旧
  ClusterIP 改到 `10.99.145.85:443`,并给两条 HTTPRoute 追加了 `.apikv.com` hostname
  (原先只有 `.app.com`)。**实测:`config.apikv.com` 200 / `config-api.apikv.com` 401(自带鉴权)**
- 另一台公网机 8.138.194.254(ssh 别名 **node2**,端口 34124,**阿里云**,与集群内 node2 `192.168.3.202` 重名但无关)跑 harbor/img/minio/gorse。**2026-08-19 已接入 Pangolin**(站点 `node2`, siteId 5),见下面「node2 站点」一节;`auth.apikv.com` 解析已指 node1(未建资源);casdoor 已由 `casdoor.apikv.com` 暴露(2026-08-13)
- ⚠️ **阿里云 ICP 拦截(2026-08-19 实付学费)**:`apikv.com` **未在阿里云备案**,任何经该域名访问 8.138.194.254 的请求都被阿里云在网络层拦截——HTTP 返 403(`Server: Beaver`,body 是 `<title>Non-compliance ICP Filing</title>` + 跳 `aliyun.com/beian/beian-block`),HTTPS 在 SNI 后直接 reset。`harbor`/`img` 这两个早就存在的子域同样被拦。**所以给这台机的服务"配域名+证书直连"是死路,唯一解是走隧道让公网流量落到 node1(腾讯云,不拦)**。判别方法:纯 IP 访问通、带 Host/SNI 的域名访问 403/reset,就是它

## 面板与站点/资源现状

- 面板 `https://pangolin.apikv.com`,管理员 `admin@apikv.com`(密码在用户处;2026-08-19 重置过一次 —— 密码以 argon2 哈希存 `config/db/db.sqlite` 的 `user.passwordHash`,**服务器上没有明文副本**,忘了只能改库重置)
- Sites:`node3-local`(siteId 1, local;**面板里的历史实体名,保持不改**,即 node1 本机)/ `mac`(siteId 2, newt, 离线——Mac 重装后 newt 未恢复)/ **`k8s-cluster`(siteId 4, newt, 当前在用)** / **`node2`(siteId 5, newt, 2026-08-19 新建, subnet `100.89.128.8/30`)**。
  旧的 `k8s`(siteId 3)已于 2026-08-19 删除 —— 删之前先把资源 3/4 的 target 改到了 siteId 4,
  删后实测 `config.apikv.com` 200 / `config-api.apikv.com` 401 不变。
  **顺序很重要**:先迁 target 再删站点,反过来会让资源短暂失去后端
- Resources:`blog.apikv.com`(blog,target `https://blog:443`;**2026-08-18 traefik-config 实查:早前的根域 `apikv.com`+`www` 已无 router,公网 404 空置**)/ `config.apikv.com`(SSO on)/ `config-api.apikv.com`(SSO off,应用自带鉴权)/ `casdoor.apikv.com`(SSO off,自带鉴权,target `10.1.0.8:8000`)/ 另有 kaneo/dev/ntfy/stream/cat 等,以 `traefik-config` 后门实查为准
- k8s newt:helm release `newt`(ns `pangolin`,chart `fossorial/newt`);凭据看 `helm get values newt -n pangolin`(inline,勿把 values 文件提交入库)
- Mac newt:`~/apps/newt/newt` + 同目录 launchd plist(含凭据,在仓库外);日志 `/tmp/newt.log`

### node2 站点(siteId 5, 2026-08-19 建)

- **newt 用二进制 + systemd,不是 docker**:node2 的镜像加速器 `docker.1ms.run` 没有 `fosrl/newt` 的 manifest,
  而 `docker pull` 失败时**退出码仍是 0**(容易误判成功);改走 GitHub release 后 node2 直连只有几十 KB/s 超时,
  最后是**开发机挂代理(192.168.3.220:7890)下载再 scp**。二进制 `/home/docker/newt/newt`(1.15.0),
  凭据 `/home/docker/newt/newt.env`(600,**不入库**),unit `/home/docker/newt/newt.service` 经
  `systemctl link` 挂载(不在 /etc 里存副本,改完 `daemon-reload` 即可)
- **必须带 `--disable-clients`**:Pangolin 给该站点下发的 clients 地址是 `100.90.128.1`(**缺 `/20` 掩码**,
  DB `sites.address` 里能看到,其他站点都是带掩码的),newt 1.15.0 解析失败刷
  `Failed to ensure WireGuard interface: invalid IP address format`。只影响 clients 功能,
  站点资源转发不受影响,显式关掉即可
- **target 一律写 `127.0.0.1:<port>`**:newt 跑在宿主机(systemd,不是容器),回环即可达;
  配合"服务端口全绑 `127.0.0.1`"实现零公网暴露。这与 local site 那套"必须写 `10.1.0.8`"的规则**不同**,
  别混——那条约束的成因是 Traefik 在容器里
- 资源:`minio.apikv.com`(rid 16, **SSO off**, target `127.0.0.1:9000` **https**——MinIO 只讲 TLS,
  靠 Traefik 的 `insecureSkipVerify` 兼容证书域名不匹配)/ `gorse.apikv.com`(rid 17, **SSO on**,
  target `127.0.0.1:8088` http)
- ⚠️ **gorse 关 SSO 前必须先确认它自己的鉴权非空**:`8088` 是 RESTful API 和 **Dashboard 共用**的端口,
  而 gorse 默认 `dashboard_user_name`/`dashboard_password`/`api_key` **全是空串**——
  关 SSO 等于把无鉴权管理面板挂公网

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

1. HTTPRoute `hostnames` **追加** `xxx.apikv.com`(保留原 `*.dev.test`,增量可回退):
   `kubectl patch httproute <name> -n <ns> --type=json -p='[{"op":"add","path":"/spec/hostnames/-","value":"xxx.apikv.com"}]'`
2. 面板建资源:subdomain `xxx`,site `k8s`,target **`10.99.145.85:443` 走 https**(重建后的新 ClusterIP)

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
ip route get 1 | awk '{print $7; exit}'        # node1 → 10.1.0.8
hostname -I | awk '{print $1}'                 # 备选

# ② 容器在哪些网络上、各自什么 IP —— 判断能不能走容器名
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}' <容器名>
#   含 pangolin_frontend → target 写容器名(blog 模式)
#   不含               → 只能走宿主端口 + 10.1.0.8
```

实测(2026-08-12):`blog`/`pangolin` 都在 `pangolin_frontend`,而 `kaneo-kaneo-1` 在
`kaneo_default`(172.28.0.3)——**跨网络,Traefik 到不了它的容器 IP**,所以 kaneo 只能走宿主端口。
(2026-08-13 casdoor 又踩同款:target 填了 `casdoor_default` 的容器 IP 172.18.0.2,改 `10.1.0.8:8000` 即通。)

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
- **DB 后门关 SSO 改的是 `resourcePolicies` 表**(经 `resources.defaultResourcePolicyId` 关联)的 `sso` 列;`resources.sso` 是遗留列,置 0 无效(2026-08-13 casdoor 实测)。badger 中间件恒挂在 router 上,放行与否由 pangolin 运行时按 policy 判定,所以 traefik-config 里看不出 SSO 开关

## 其它操作事实

- **raw TCP/UDP**:入口已预留 30001/30002(tcp)、30003(udp)——compose 的 gerbil ports + Traefik entryPoints(命名必须 `tcp-30001` 格式)+ 腾讯云安全组三处一致才通;扩端口要改前两处并 `docker compose up -d --force-recreate gerbil traefik`(共享 netns,一起重建)
- **性能**:Mac/k8s 的 newt 是用户态 netstack(低流量够用);Linux 高吞吐场景加 `USE_NATIVE_MAIN_INTERFACE=true` + NET_ADMIN 切内核 WireGuard,验证:`wg show` 能看到接口才是内核态
- **blog 部署与回滚**(走 GitHub Actions,见 blog 仓 `.github/workflows/ci.yaml`):push main → 构建 linux/amd64 镜像打 `latest`+短 sha 两个 tag → 推腾讯云 CCR → scp `compose.yml` 覆盖服务器 → `docker compose pull && up -d` → 清理 30 天前旧镜像 → curl 断言 `https://blog.apikv.com` 返回 200。**`compose.yml` 以 blog 仓库为真相源,每次部署覆盖服务器**(2026-08-19 实查订正:此前记的「scp 直送 → docker load」与「服务器版是真相源、勿用仓库版覆盖」描述的是更早的手工链路,已不成立)。回滚用 30 天内保留的 sha tag 镜像 `docker tag ccr.ccs.tencentyun.com/sumery/blog:<旧sha> ...:latest && docker compose up -d`(原 `compose.yml.bak` 已不在服务器,该指引作废)
- **blog 的 nginx 配置有一处遮蔽**(2026-08-19 实查):`compose.yml` 把 `/home/docker/blog/conf` 整卷挂到 `/etc/nginx/conf.d`,遮蔽掉镜像里 `COPY` 进去的 `nginx.conf`。根因是仓库版用了 `${DOMAIN}` 模板变量,而 `conf.d/` 不做 envsubst(只有 `templates/` 才做),变量永远替换不掉,只能靠挂载一份硬编码的覆盖。服务器上那份是 2026-04-22 的,`server_name` 仍写死 `apikv.com`/`www`,与现域名 `blog.apikv.com` 不符——因 nginx 默认 server 行为仍能正常返回文件,故非故障源,但改域名时要记得它在那儿
- 面板证书状态永远 pending 是 BYO 证书的已知显示问题(上游 #3243),以浏览器实际握手为准
- WireGuard 全走 UDP;若运营商晚高峰 QoS 严重,fallback 是 frp(TCP)换隧道层
- DNSPod API 凭据(DP_Id/DP_Key)在 node1 `/root/.bash_history`(用户签证书时 export 过)——**该 Key 已于 2026-08-18 轮换作废**,续期证书要用新 Key;泛解析已加,一般不再需要
