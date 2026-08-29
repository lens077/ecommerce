---
name: pangolin-tunnel
layer: team
description: 公网暴露基础设施(Pangolin)的拓扑事实、面板 API 操作模式、k8s HTTPRoute 暴露套路与已知坑——对外公开任何内网服务前必读
---

# Pangolin 内网穿透 / 公网暴露(2026-08-08 部署)

> 🟡 **证书已续期至 2026-11-25,但自动续期链路仍然缺位。**
> 2026-08-27 实查:两处部署点(`/home/docker/pangolin/config/traefik/certs/apikv.com.crt`
> 与 `/home/docker/blog/ssl/nginx.crt`)均已是新证书 `notAfter=Nov 25 23:59:59 2026`,
> 公网实测同步生效。**但 `/root/.acme.sh/` 仍无证书产物、crontab 仍无续期条目**——
> 也就是说这次是手工续的,下次(11-25 前)还得手工来。
> 到期后果不变:**所有 `*.apikv.com` 公网入口一起挂**
> (blog / config / config-api / casdoor / pangolin 面板 / minio / gorse / harbor / dsh …),
> 以及 node1 上复用同一张证书的 `rediss://redis.apikv.com`。
> 重建续期链路时 DNSPod 旧 Key 已作废,要用轮换后的新 Key 或腾讯云子账号走 dns_tencent。
> **续期后记得同步两处部署点**(见下),并重启 traefik 让它加载新证书。

> 人类速查版(纯命令)在仓库根 `helper.sh` 的 Pangolin 小节(本机文件,已 gitignore 不入库,fresh clone 没有);
> 本文件是 AI 操作用的完整事实与接口。**凭据一律不写值,只写位置**(runbook §0 硬规则)。

## 拓扑

```
公网用户 ──HTTPS/TCP/UDP──> node1 VPS(ssh 别名 node1,与 hostname 一致,node1,腾讯云)
                              ⚠️ 本文的 node1/node2 **一律指公网 VPS**,与集群节点无关——
                              集群节点叫 node101/102/103(192.168.3.101-103),命名不再冲突
                              Pangolin CE 1.21.1 + Gerbil 1.4.3 + Traefik v3.7,目录 /home/docker/pangolin/
                              │ WireGuard(UDP 51820/21820,内网侧纯出站)
              ┌───────────────┼───────────────────┐
        Mac(newt 1.15.0)   k8s 集群(helm newt)   [blog 容器:同机,不走隧道]
        ~/apps/newt/         ns pangolin           站点资源 blog.apikv.com → https://blog:443
```

- 实例身份:腾讯云**轻量应用服务器 Lighthouse** `lhins-1of5dkfj`(ap-guangzhou-7),不是 CVM——防火墙是 Lighthouse 实例防火墙(`tccli lighthouse DescribeFirewallRules/CreateFirewallRules/DeleteFirewallRules --InstanceId`),没有安全组;TAT 助手在线,`tccli tat RunCommand` 可免 SSH 执行命令(带外救援通道,2026-08-11 实测可用);SSH 端口 34123(22/3389 已从防火墙移除)
- **放行端口时用 `CidrBlock` 锁死来源,别习惯性写 `0.0.0.0/0`**(2026-08-19):给 gorse 放行 redis 6379 时
  锁到 `<node2-source-cidr>`,只有 node2 进得来——数据库/缓存这类带弱口令的服务尤其不能对全网开。
  ```bash
  tccli lighthouse CreateFirewallRules --InstanceId lhins-1of5dkfj --FirewallRules \
    '[{"Protocol":"TCP","Port":"6379","CidrBlock":"<node2-source-cidr>","Action":"ACCEPT","FirewallRuleDescription":"..."}]'
  ```
  **验证要有对照组**:从"应该能连的机器"和"不该能连的机器"各测一次,再加一个已知放行的端口(如 443)
  排除网络本身的问题——只测通不测拦,等于没验。
  ⚠️ **`DeleteFirewallRules` 与 `CreateFirewallRules` 之间有裸奔/断连窗口**:先删后加时,若 Create
  因参数问题失败(实测**描述里含 `://` 会让 tccli 解析成 usage 错误**),端口会处于"无规则=拒绝"状态,
  依赖它的服务立刻断。**先加新规则再删旧规则**,或至少在 Create 失败后立刻补救
- ⚠️ **每个端口的规则是成对的(IPv4 + IPv6)**:`DescribeFirewallRules` 里 `CidrBlock` 为空的那条,
  其实是 `Ipv6CidrBlock: "::/0"`。**只删 IPv4 那条会留下 IPv6 半开**,删它要传 `Ipv6CidrBlock` 字段
- 🔑 **`docker ps` 显示 `0.0.0.0:<port>` ≠ 公网可达——云防火墙才是真相**(2026-08-19 靠这条省掉一整轮改动):
  node1 上 kaneo(5173)/casdoor(8000)/webhook(8082) 都绑着 `0.0.0.0`,看起来全在裸奔,
  实测从公网**全部连不上**,因为 Lighthouse 根本没放行这些端口。给它们改端口/收紧绑定是零收益,
  却要冒同步 Pangolin target 和 OAuth 配置的风险。**判断暴露面要从外部实测,不要读 `docker ps`**;
  测的时候带一个已知放行的端口(443)当对照组,否则分不清"被拦"和"网络不通"
- **node1 自己也跑着 gorse 依赖的 Redis**(`/home/docker/redis/`,与 Pigsty 那台和集群内 dragonfly 都无关):
  2026-08-19 起 `port 0` + `tls-port 6379`,复用同一张 `*.apikv.com` 证书,客户端必须 `rediss://` 连
  `redis.apikv.com`。**证书目录属主必须是 uid 999**(redis 官方镜像的运行用户),否则读不到私钥启动即失败;
  `tls-auth-clients no` 时仍强制要求 `tls-ca-cert-file`,拿 fullchain 自身充数即可
- 域名 `apikv.com`,**DNS 在 DNSPod(不是 Cloudflare)**,已有 `*` 泛解析 → node1;新子域**零 DNS 操作**
- 泛域名证书 ZeroSSL `*.apikv.com`(acme.sh dns_dp 签),**2026-11-25 到期**(2026-08-27 已手工续期,详见文首横幅);
  部署在两处:`/home/docker/blog/ssl/`(原件)与 node1
  `/home/docker/pangolin/config/traefik/certs/apikv.com.{crt,key}`,**续期要同步两处**
- k8s:**集群已于 2026-08 重建**,现为 node101/node102/node103 = `192.168.3.101-103`
  (control-plane 是 node101),全 arm64。Cilium Gateway API,
  `cilium-gateway`(ns default,LB **192.168.3.121**,ClusterIP **10.99.145.85**)。
  ⚠️ 下文「k8s HTTPRoute 暴露套路」里的 target `10.97.94.118:443` 是**旧集群的 ClusterIP,已失效**,
  要用上面的新值。
  newt 由 **kubernetes 仓的 `components/newt/`** 管理(**manifest 安装,不是 helm**——
  上游 `https://fosrl.github.io/newt` 实测 404,没有可用 chart 仓库),凭据存
  `creds/newt-{id,secret}` 不入库。资源 3/4(config/config-api)target 为 `10.99.145.85:443`,
  两条 HTTPRoute 都追加了 `.apikv.com` hostname(原先只有 `.app.com`)。
  实测:`config.apikv.com` 200 / `config-api.apikv.com` 401(自带鉴权)
- 另一台公网机 node2(ssh 别名 **node2**,端口 34124,**阿里云**;与集群节点无关)跑 harbor/img/minio/gorse。**2026-08-19 已接入 Pangolin**(站点 `node2`, siteId 5),见下面「node2 站点」一节;`auth.apikv.com` 解析已指 node1(未建资源);casdoor 已由 `casdoor.apikv.com` 暴露(2026-08-13)
- ⚠️ **阿里云 ICP 拦截(2026-08-19 实付学费;本条是该结论的唯一出处,
  [tls-enablement.md](tls-enablement.md) 指回这里)**:`apikv.com` **未在阿里云备案**,任何经该域名访问 node2 的请求都被阿里云在网络层拦截——HTTP 返 403(`Server: Beaver`,body 是 `<title>Non-compliance ICP Filing</title>` + 跳 `aliyun.com/beian/beian-block`),HTTPS 在 SNI 后直接 reset。`harbor`/`img` 这两个早就存在的子域同样被拦。**所以给这台机的服务"配域名+证书直连"是死路,唯一解是走隧道让公网流量落到 node1(腾讯云,不拦)**。判别方法:纯 IP 访问通、带 Host/SNI 的域名访问 403/reset,就是它

## 面板与站点/资源现状

- 面板 `https://pangolin.apikv.com`,管理员 `admin@apikv.com`(密码在用户处;2026-08-19 重置过一次 —— 密码以 argon2 哈希存 `config/db/db.sqlite` 的 `user.passwordHash`,**服务器上没有明文副本**,忘了只能改库重置)
- Sites:`node3-local`(siteId 1, local;**面板里的历史实体名,保持不改**,即 node1 本机)/
  **`k8s-cluster`(siteId 4, newt)** / **`node2`(siteId 5, newt, subnet `100.89.128.8/30`)** /
  **`mac`(siteId 6, newt 1.16.0, 本 Mac 当前在用)**。
  ⚠️ **同名不同 id 的坑(2026-08-29)**:当前的 `mac` 是 **siteId 6**,它由原 `mac2` 改名而来;
  过期无用的旧 `mac`(**siteId 2**)已在同一次操作里删除。**查站点认 siteId、不要认名字**——
  历史文档、旧截图和面板日志里的 `mac` 可能指向已删的 siteId 2,`mac2` 则是现役 siteId 6 的旧名。
  已删/已死的站点(siteId 2 旧 `mac`、siteId 3 `k8s`)留下一条通用教训:
  **站点凭据的回显只有建站那一刻有,面板事后不回显**——
  丢了就只能重建站点。删站点前**先把资源 target 迁到新站点再删**,反过来资源会短暂失去后端
- Resources:`blog.apikv.com`(blog,target `https://blog:443`)/ **根域 `apikv.com`+`www`=静态导航页(2026-08-26 起,容器 `homepage` 走 file provider 路由,不在面板;部署物 docker-deploy 仓 `homepage/`,此前 404 空置)**/ `config.apikv.com`(SSO off,2026-08-26 库实查)/ `config-api.apikv.com`(SSO off,应用自带鉴权)/ `casdoor.apikv.com`(SSO off,自带鉴权,target `10.1.0.8:8000`)/ **`dsh.apikv.com`(rid 19, **SSO on**, site `mac`=siteId 6, target `127.0.0.1:3080` http)——
  ⚠️ DSH 自带浏览器信任栅栏:Host 非回环且不在 trustedHosts 就 403,**外壳能开但工作区永远为空**;
  已在 `~/.dsh/profiles/web/cordis.patch.yml` 的 `connection` 条目补 `trustedHosts: ['dsh.apikv.com']`
  (热生效不用重启,**必须写纯 YAML 数组——`!!js` 表达式在用户补丁层实测不生效**)。
  经隧道时 settings/credentials 等特权方法仍 403 属设计内**/ 另有 kaneo/ntfy/stream/cat 等,以 `traefik-config` 后门实查为准。
  **已删:`dev.apikv.com`(前端 dev server 远程预览)——2026-08-29 随 dev 子域资源一并删除,实测返回 404;
  静态导航页(docker-deploy 仓 `homepage/site/index.html`)的对应卡片已同步移除**
- k8s newt:helm release `newt`(ns `pangolin`,chart `fossorial/newt`);凭据看 `helm get values newt -n pangolin`(inline,勿把 values 文件提交入库)
- **k8s 站点(siteId 4)的资源全部指同一个 target `10.110.51.106:443 https`** —— 那是 `cilium-gateway` 的 ClusterIP,分流靠 HTTPRoute 的 hostname 而非不同 target。2026-08-27 新增四个(均 **SSO on**,控制面靠登录墙兜底):`argocd`(rid 31)/`consul`(rid 32)/`search`(rid 33)/`cart-api`(rid 34)。
  ⚠️ **302 只证明 Pangolin 拦住了,不证明后端活着**——验后端要在集群内直连 `curl -H "Host: xxx.apikv.com" https://10.110.51.106/`,否则 502 会被登录墙掩盖。
  ⚠️ 2026-08-24 那轮 helm uninstall 之后,`observability`/`victoriametrics`/`logging` 里 **Grafana/Jaeger/Loki/VictoriaMetrics 的 HTTPRoute 是孤儿**(命名空间里零 Deployment,`kubectl get endpoints` 无后端),给它们建公网入口只会得到 502。建资源前先查 endpoints。
- Mac newt(2026-08-20 重建):二进制 `~/apps/newt/newt`(1.16.0, darwin-arm64),凭据
  `~/apps/newt/newt.env`(600,仓库外),launchd `~/Library/LaunchAgents/com.apikv.newt.plist`
  (600,含凭据,RunAtLoad+KeepAlive),日志 `/tmp/newt.log`,带 `--disable-clients`。
  **newt 跑在宿主机 → target 写 `127.0.0.1:<port>`**(同 node2 规则,与 local site 的 `10.1.0.8` 不同)

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
  靠 Traefik 的 `insecureSkipVerify` 兼容证书域名不匹配)/ `gorse.apikv.com`(rid 17, **SSO off**,
  target `127.0.0.1:8088` http,改由 gorse 自带鉴权)/ `harbor.apikv.com`(rid 18, **SSO off**——
  `docker login` 过不了 SSO, target `127.0.0.1:49600` **https**;harbor 的 http 端口会 308 跳
  `https://<hostname>:<https_port>`,用 http target 会把浏览器导回那个被 ICP 拦的地址)
- **harbor 换证书要放两处**:`harbor.yml` 里 `certificate:` 指的路径(`prepare` 从这里取)与
  `data/secret/cert/server.{crt,key}`(实际生效的副本,属主 `10000:10000`)。只改前者不重跑 prepare 不生效,
  只改后者下次 prepare 会被覆盖回去。同理改端口要**同时**改 `harbor.yml` 和 `docker-compose.yml`
- ⚠️ **gorse 关 SSO 前必须先确认它自己的鉴权非空**:`8088` 是 RESTful API 和 **Dashboard 共用**的端口,
  而 gorse 默认 `dashboard_user_name`/`dashboard_password`/`api_key` **全是空串**——
  关 SSO 等于把无鉴权管理面板挂公网。2026-08-19 已三项都配上(`config.toml`,备份
  `config.toml.bak-20260819`)才关的 SSO,实测无 key/错 key 均 401、Dashboard 302→`/login`
- **SSO 与应用自带鉴权二选一**:业务是服务端 HTTP 调用,过不了 SSO 的浏览器登录流程,所以
  凡是要被后端调用的资源都只能关 SSO + 依赖应用自身鉴权(同 `config-api.apikv.com` 的模式)。
  没有自带鉴权的应用,别急着关 SSO——先给它配上

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
- `PUT /org/main/site` `{name,type:"newt",exitNodeId,subnet,newtId,secret}` 建站点(2026-08-20 实测)。
  ⚠️ **别把 pick-site-defaults 返回的 `address` 原样传回**——会 400 `Invalid address format`
  (与 node2 那次 clients 地址缺掩码同族),省略该字段让服务端自行分配即可
- 注意 Traefik 动态配置 **5s 轮询**,改完等 ≥6s 再验证,别把时序当故障
- 验证「登录保护生效」的判据:未登录 curl 应 **302 → `pangolin.apikv.com/auth/resource/<guid>`**
  且 body 无业务内容;只看 200/404 分不清保护与故障

## k8s HTTPRoute 暴露套路(两步,已验证)

1. HTTPRoute `hostnames` **追加** `xxx.apikv.com`(保留原 `*.dev.test`,增量可回退):
   `kubectl patch httproute <name> -n <ns> --type=json -p='[{"op":"add","path":"/spec/hostnames/-","value":"xxx.apikv.com"}]'`
2. 面板建资源:subdomain `xxx`,site **`k8s-cluster`(siteId 4)**,target
   **`10.99.145.85:443` 走 https**(cilium-gateway 的 ClusterIP;LB 侧是 `192.168.3.121`)

**坑(2026-08 实付学费)**:本仓的 HTTPRoute parentRef 都带 `sectionName: https` → 路由只挂 443 listener,
**80 上无任何路由,envoy 对一切 Host 返 404**。target 走 80 会 404;必须 443/https(Gateway 用自签
`global-default-tls`,Traefik 已配 `serversTransport.insecureSkipVerify` 兼容)。
判别 404 来源:响应头 `server: envoy` + 直连 svc ClusterIP 对比。

## 新增资源:正确姿势与 503 排查(2026-08-27 一次性付清四笔学费)

> 这一节是**加站点前必读**。四个站点曾以「已上线」交付但实际全是 503,根因是验收判据错了。

### ⛔ 建资源**必须走面板/API**,DB 后门只能改已有资源

`targets.internalPort`(WireGuard 隧道内的映射端口)与 `authToken`(加密令牌)由 Pangolin
**运行时生成**,后门 INSERT 补不出来;还会漏掉 `roleResources` 授权行(缺了连 API 都会
`403 User does not have access to this resource`,自己都管不了自己建的资源)。
症状:`servers: []` → 公网 **503**。DB 后门的正当用途只有改 target 值、SSO 开关、路径放行规则。

### Pangolin 把 target 踢出 `servers` 的四个否决条件(`/app/dist/server.mjs` 源码实证)

排查 503 按这个顺序查,**比逐个字段猜快得多**:

```js
if (!target.enabled) return false;                        // ① 手动禁用
if (target.health == "unhealthy") return false;           // ② 健康检查判死
if (anySitesOnline && !target.site.online) return false;  // ③ 站点离线
if (site.type === "newt" && (!target.internalPort || !target.method || !site.subnet))
    return false;                                          // ④ newt 三件套缺一不可
```

⚠️ **面板建资源不要勾 Health Check**:28 个 target 里 27 个 `hcEnabled=0`,唯一开启的
`silo` 就因 `hcPath=/` + `hcPort` 空被判 `unhealthy` 而 503——**而后端一直是健康的**
(隧道端口实测 REACHABLE、直连 9001 三个路径全 200)。要开必须同时配对 `hcPort`/`hcPath`。
`resources.health` 是运行时回写的**结果**字段,改它无效,会被覆盖。

### 三条验收,缺一不可

**302 只证明 SSO 登录墙生效,它发生在回源之前,证明不了后端活着**——这正是四个站点被误报
「已上线」的原因。

```bash
# ① servers 非空(最关键,漏掉这条就会误报)
ssh node1 'PIP=$(docker inspect pangolin --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}")
  curl -s http://$PIP:3001/api/v1/traefik-config' | grep -A2 '<rid>-.*-service'
#   期望 [{"url":"https://100.89.128.x:<internalPort>"}];空数组 = 必 503

# ② 公网响应(等 Traefik 5s 轮询)。SSO on → 302;SSO off → 应用自身响应
curl -sk -o /dev/null -w '%{http_code}\n' https://xxx.apikv.com/

# ③ 后端真实回源(绕过登录墙)。带 Host 头,裸 IP 无 Host 会被 envoy 判 404 误导
ssh node1 'docker exec traefik sh -c "wget -q -S -O /dev/null --no-check-certificate \
  --header=\"Host: xxx.apikv.com\" https://100.89.128.x:<internalPort>/ 2>&1 | grep -m1 HTTP/"'
```

### 加站点前置:先确认后端活着

k8s 服务查 `kubectl -n <ns> get endpoints <svc>`(08-24 有四条指向已卸载服务的孤儿路由,
建入口只会得到 502);主机服务直连实测协议与端口——**不要照抄同机其他服务**,
`silo` 的 9001 是 `minio-1.pigsty` 而同机 9000 是 `sss.pigsty`,`tlsServerName` 照抄必失败。

## local site(node3-local) 的 target 写法(2026-08-11 与 08-12 两次 kaneo 502 实付学费)

**根源只有一条**:转发是从 **Traefik 容器**发起的,所以 target 必须写「Traefik 容器视角下能到达该服务的地址」,
而不是「服务自己监听时用的地址」。**监听地址 ≠ 目的地址**——这两次都栽在把前者当后者填。

| 写法 | 结果 | 为什么 |
|---|---|---|
| `10.1.0.8:<port>` | ✅ 唯一正确(宿主端口服务) | 宿主内网 IP,服务需监听 0.0.0.0 |
| 容器名`:<port>` | ✅ 正确(容器接入 `pangolin_frontend` 网络后) | blog 模式,连宿主端口都不用发布 |
| `localhost` / `127.0.0.1` | ❌ 快 502 | 是 Traefik **容器自己**,里面没有该端口(2026-08-11 踩) |
| `0.0.0.0` | ❌ 快 502 | **监听地址不是目的地址**,语义同上(2026-08-12 踩) |
| 公网 IP `node1` | ⚠️ 绕公网再回来 | 多一跳,且可能被防火墙挡 |

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

**同族判别(从已归档的 ssh 端口迁移实录提炼,适用于任何「连不上」)**:
**Connection refused** = 包到达了主机但无监听(或 REJECT 规则)→ 云防火墙是好的,查服务端监听;
**timeout** = 包根本没到(安全组/防火墙 DROP)→ 查云控制台放行。
这一条把「云厂商放行了吗」和「服务起来了吗」一刀切开,少猜半小时。
动远程访问配置前:确认带外通道能用(node1 的 TAT `tccli tat RunCommand` 是首选)、
留一个 tmux 长会话、新旧入口并行过渡。
分层核对顺序:①容器 `docker ps` 是否 healthy → ②宿主 `curl http://10.1.0.8:<port>` 是否 200 → ③下面那条后门看实际 target。
两步都正常而外部 502,就一定是 target。
- 排查 target 实际值不用登面板:宿主 `curl http://<pangolin容器IP>:3001/api/v1/traefik-config` 直接看 services 的 url
- 面板不可用/无密码时可直改 `/home/docker/pangolin/config/db/db.sqlite` 的 `targets` 表(python3 自带 sqlite3,**先 cp 备份**),Pangolin 不缓存,Traefik 5s 轮询内生效
- **DB 后门关 SSO 改的是 `resourcePolicies` 表**(经 `resources.defaultResourcePolicyId` 关联)的 `sso` 列;`resources.sso` 是遗留列,置 0 无效(2026-08-13 casdoor 实测)。badger 中间件恒挂在 router 上,放行与否由 pangolin 运行时按 policy 判定,所以 traefik-config 里看不出 SSO 开关
- **DB 后门也能加路径放行规则**(2026-08-26 node3 观测五资源实测):`resourcePolicyRules` 插 `(ruleId,resourcePolicyId,enabled=1,priority,action='ACCEPT',match='PATH',value='/insert/*')` 并把对应 `resourcePolicies.applyRules` 置 1,**即时生效不用重启**;备份用 sqlite backup API 而非 cp(库是热的)。据此 `node3-{metrics,logs,traces,vmalert,alerts}` 已挂 SSO,前三者放行写入路径(`/insert/*`、`/opentelemetry/*`、`/api/v1/write`,vector 与 OTLP 推送不受影响);`node3-otlp` **不挂 Pangolin 鉴权是刻意的**——机器客户端过不了 SSO,该资源的鉴权落在 collector 自己的 `bearertokenauth` 上(2026-08-27 起匿名写入已关闭,详见 [local-env.md](local-env.md)「OTLP 已强制鉴权」)。遗留表 `resourceRules` 当时同步双写了一份,未验证是否被读

## 其它操作事实

- **raw TCP/UDP**:入口已预留 30001/30002(tcp)、30003(udp)——compose 的 gerbil ports + Traefik entryPoints(命名必须 `tcp-30001` 格式)+ 腾讯云安全组三处一致才通;扩端口要改前两处并 `docker compose up -d --force-recreate gerbil traefik`(共享 netns,一起重建)
- **性能**:Mac/k8s 的 newt 是用户态 netstack(低流量够用);Linux 高吞吐场景加 `USE_NATIVE_MAIN_INTERFACE=true` + NET_ADMIN 切内核 WireGuard,验证:`wg show` 能看到接口才是内核态
- 面板证书状态永远 pending 是 BYO 证书的已知显示问题(上游 #3243),以浏览器实际握手为准
- WireGuard 全走 UDP;若运营商晚高峰 QoS 严重,fallback 是 frp(TCP)换隧道层
- DNSPod API 凭据(DP_Id/DP_Key)在 node1 `/root/.bash_history`(用户签证书时 export 过)——**该 Key 已于 2026-08-18 轮换作废**,续期证书要用新 Key;泛解析已加,一般不再需要
