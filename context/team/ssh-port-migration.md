---
name: ssh-port-migration
layer: team
description: SSH 改端口在 Ubuntu 24.04(socket activation)下的正确姿势与 2026-08-11 node3 锁死实录——改 sshd_config 的 Port 无效、ListenStream 纯端口号只绑 IPv6 导致 v4 全断、cloud-init 首值覆盖 PasswordAuthentication
---

# SSH 端口迁移(Ubuntu 24.04 socket activation)

## 最终版修复 shell(先看这个)

服务器端(root),以 22 → 34123 为例。**前提:云安全组已放行新端口,且带外通道(云厂商 VNC)可用**:

```bash
NEW_PORT=34123

# 1) Ubuntu 22.10+ 的 SSH 端口归 ssh.socket 管,sshd_config 的 Port 被忽略。
#    ListenStream 必须显式写 v4 + v6 两条 —— 纯端口号只会得到 [::] socket,
#    v4-mapped 不一定生效,IPv4 会整个 Connection refused(实测锁死过)。
mkdir -p /etc/systemd/system/ssh.socket.d
cat > /etc/systemd/system/ssh.socket.d/listen.conf <<EOF
[Socket]
ListenStream=
ListenStream=0.0.0.0:22
ListenStream=[::]:22
ListenStream=0.0.0.0:${NEW_PORT}
ListenStream=[::]:${NEW_PORT}
EOF
# ↑ 过渡期保留 22。从外部验证新端口能登录后,删掉两条 22 再重跑 3)、4)。
#   人已在 VNC 里时可直接不写 22 —— VNC 就是保底。

# 2) sshd_config 的 Port 也同步改(对 socket activation 无效但无害,防止两处口径漂移);
#    同时压掉 cloud-init 的首值覆盖(见坑③)
sed -i "s/^#\?Port .*/Port ${NEW_PORT}/" /etc/ssh/sshd_config
printf 'PasswordAuthentication no\n' > /etc/ssh/sshd_config.d/50-cloud-init.conf

# 3) 语法校验通过才应用;restart 不断已建立的会话
sshd -t
systemctl daemon-reload
systemctl restart ssh.socket ssh.service

# 4) 验证:v4 与 v6 两行【必须同时出现】,只有 [::] 没有 0.0.0.0 就是坑②现场
ss -tln | grep -E ":${NEW_PORT} "
```

客户端 `~/.ssh/config` 加一行 `Port 34123` 即可,scp/rsync/git 走别名自动继承。
新端口首连会重新确认 host key(`known_hosts` 里 `[ip]:34123` 是独立条目,正常现象)。

**迁移顺序铁律**:安全组放行新端口 → 服务器新旧双端口并行 → **从外部新建连接**验证新端口 →
客户端切换 → 撤旧端口(drop-in + 安全组)。全程保证手里至少有一条已验证可用的登录通道。

## 踩坑故事(2026-08-11 node3 实录)

### 坑① 改 sshd_config 的 Port + reload,新端口 refused

- **症状**:`sshd -T` 明明显示 `port 34123`,外部连 34123 却 Connection refused;
  journalctl 里 SIGHUP reload 后 sshd 仍打 "Server listening on 0.0.0.0 port 22"。
- **关键陷阱**:`sshd -T` 显示的是**配置解析结果**,不是实际监听。实际监听看 `ss -tlnp`,
  fd 的 users 列里挂着 `systemd` 就是 socket activation —— 端口由 `ssh.socket` 的
  ListenStream 决定,`sshd_config` 的 Port/ListenAddress 整段被忽略。
- **判别**:`systemctl is-enabled ssh.socket` 返回 enabled 即中招(Ubuntu 22.10+ 默认)。
- **修复**:写 `ssh.socket` 的 drop-in(见最终版脚本),不是改 sshd_config。

### 坑② ListenStream 纯端口号 → IPv4 全断,把自己锁在门外

- **症状**:drop-in 写 `ListenStream=22` + `ListenStream=34123`,restart 后 `ss` 只剩
  `[::]:22`/`[::]:34123` 两行(原本 22 有 `0.0.0.0:22` 和 `[::]:22` 两条),从公网 v4 连
  **两个端口全部 refused** —— 保底的 22 也一起没了。
- **关键陷阱**:两层。(a) 纯端口号的 ListenStream 只创建 IPv6 通配 socket,IPv4 靠
  v4-mapped 兜底,这台机器上没生效;(b) restart 后**已建立的会话不断**,当时的探查
  会话一切正常、`ss` 也"看到了监听",直到从外部发起新连接才发现全断 ——
  **验证必须用新建连接,且 `ss` 输出必须逐行确认 `0.0.0.0` 与 `[::]` 同时在场**。
- **修复**:v4/v6 显式各写一条(最终版脚本);救援走带外通道。

### 坑③ 服务器"设了" PasswordAuthentication no,实际一直是 yes

- **症状**:主配置写了 `PasswordAuthentication no`,`sshd -T` 却显示 yes;
  auth 日志里持续有陌生 IP 对 root 的连接尝试。
- **关键陷阱**:OpenSSH **首值生效**,而 `Include /etc/ssh/sshd_config.d/*.conf` 在主配置
  第 12 行 —— cloud-init 生成的 `50-cloud-init.conf` 里的 `PasswordAuthentication yes`
  永远排在你的 no 前面。改主配置怎么改都没用,且**生效值只能信 `sshd -T`,不能信文件**。
- **修复**:直接覆写 `sshd_config.d/50-cloud-init.conf` 为 no。

### 锁死之后的救援通道盘点(按当时可用性)

| 通道 | 当时状态 |
|---|---|
| 腾讯云网页 VNC(OrcaTerm) | ✅ 最终走的路,不依赖 sshd |
| Pangolin 预留 raw TCP 30001 → 面板建资源指 `127.0.0.1:22` | ✅ 30001 在 Traefik 上活着,备选(用完必须删资源) |
| 腾讯云 TAT 自动化助手(tccli 免 SSH 下发命令) | ❌ 本机无 tccli 凭据 |
| IPv6 直连 | ❌ 无 AAAA/公网 v6 |
| 已建立的 SSH 会话 | ❌ 已断,没留 screen/tmux 长会话 |

### 通用判别技巧

- **Connection refused** = 包到达了主机但无监听(或 REJECT 规则):安全组是好的,查服务端监听;
  **timeout** = 包没到(安全组/防火墙 DROP):查云控制台。这一条把"云厂商放行了吗"
  和"sshd 生效了吗"一刀切开,少猜半小时。
- 动远程 SSH 配置前:确认带外通道能用、留一个 tmux 长会话、新旧端口并行过渡。
