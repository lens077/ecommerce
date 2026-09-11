# 用 Santa FAA 保护 macOS 开发凭证

开发机上最重要的资产往往不是代码，而是代码周围的凭证：SSH 私钥、Docker Registry 登录信息、Kubernetes kubeconfig、腾讯云 CLI 凭证、GitHub CLI Token，以及 Claude Code、Codex 等开发工具的认证文件。这些文件即使设置为 `600`，同一用户启动的其他进程通常仍可读取。

Santa 的 File Access Authorization（FAA）可以在 macOS Endpoint Security 层控制「哪个进程可以读取或修改哪个路径」。本文给出一套适合个人开发机的完整配置：先审计实际访问，再逐条开启阻断，避免一次性锁死正常工作流。

> 本文以 North Pole Security Santa `2026.7`、macOS `26.6.2` 为验证环境。Santa 版本和程序签名会变化，部署前必须用本机命令重新确认。

## 保护目标与边界

本文保护以下路径：

| 资产 | 路径 | 允许进程 |
|---|---|---|
| SSH 私钥 | `/Users/*/.ssh/id_*` | Apple `ssh`、`ssh-agent` |
| SSH 配置与主机指纹 | `config`、`known_hosts`、`known_hosts.old` | 允许读取；写入仅允许 Apple `ssh` |
| Docker 凭证 | `.docker/config.json`、`.docker/contexts/` | Docker 官方签名程序 |
| Docker Desktop 设置 | `Library/Group Containers/group.com.docker/` | Docker 官方签名程序 |
| Kubernetes 凭证 | `.kube/config` | 固定路径的 `kubectl` |
| Claude Code 数据 | `.claude/` | Anthropic 签名的 Claude Code |
| Codex 数据 | `.codex/` | OpenAI 签名的 Codex |
| 腾讯云 CLI 凭证 | `.tccli/default.credential` | 固定路径的 `tccli` |
| 腾讯云 CLI 凭证 | `.tccli/default.credential` | 固定路径的 `tccli` |
| GitHub CLI 凭证 | `.config/gh/` | 固定路径的 `gh` |

这套方案有三个限制：

- FAA 不是加密保险箱。被允许的进程如果自身遭到利用，仍可能泄露凭证。
- 不要把 Terminal、Shell、Python、Node.js 或整个 IDE 加入宽泛白名单，否则恶意脚本可以借用它们的访问权。
- 本文先使用 `AuditOnly=true`。此时 Santa 记录违规访问，但不阻止；完成正常工作流验证后再启用强制阻断。

## 1. 确认 Santa 可以工作

检查版本：

```bash
santactl version
```

确认系统扩展已经激活：

```bash
systemextensionsctl list com.apple.system_extension.endpoint_security
```

预期包含：

```text
com.northpolesec.santa.daemon ... [activated enabled]
```

检查守护进程：

```bash
santactl status
```

如果提示 `Full-disk access not granted`，打开：

```text
系统设置 → 隐私与安全性 → 完全磁盘访问权限
```

启用 Santa 或 `com.northpolesec.santa.daemon`。等待约 15 秒后重新运行 `santactl status`。

## 2. 收紧基础文件权限

FAA 是第二道控制，不替代 Unix 权限。先设置最低权限：

```bash
chmod 700 "$HOME/.ssh"
chmod 600 "$HOME/.ssh/id_"* 2>/dev/null || true
chmod 644 "$HOME/.ssh/"*.pub 2>/dev/null || true

chmod 700 "$HOME/.docker"
chmod 600 "$HOME/.docker/config.json" 2>/dev/null || true

mkdir -p "$HOME/.kube"
chmod 700 "$HOME/.kube"
chmod 600 "$HOME/.kube/config" 2>/dev/null || true

chmod 700 "$HOME/.claude" "$HOME/.codex" "$HOME/.tccli" "$HOME/.config/gh" 2>/dev/null || true
chmod 600 "$HOME/.tccli/default.credential" "$HOME/.config/gh/hosts.yml" 2>/dev/null || true
```

Docker 应尽量把实际秘密放入 macOS 钥匙串。检查 `~/.docker/config.json`，优先使用：

```json
{
  "credsStore": "osxkeychain"
}
```

## 3. 识别本机可信程序

不要照抄其他机器的 Team ID 或 Signing ID。先查真实路径：

```bash
command -v docker kubectl claude codex gh ssh ssh-agent
```

再查看 Santa 识别到的签名信息：

```bash
santactl fileinfo /usr/bin/ssh
santactl fileinfo /usr/bin/ssh-agent
santactl fileinfo "$(command -v docker)"
santactl fileinfo "$(command -v kubectl)"
santactl fileinfo "$(command -v claude)"
santactl fileinfo "$(command -v codex)"
santactl fileinfo "$(command -v gh)"
```

也可以直接查看代码签名：

```bash
codesign -dvv "$(command -v claude)" 2>&1 \
  | grep -E 'Identifier=|TeamIdentifier=|CDHash='
```

本文验证环境使用的身份如下：

| 程序 | 匹配方式 |
|---|---|
| `/usr/bin/ssh` | `PlatformBinary=true` + `SigningID=com.apple.ssh` |
| `/usr/bin/ssh-agent` | `PlatformBinary=true` + `SigningID=com.apple.ssh-agent` |
| Docker | `TeamID=9BNSXJN65R` |
| Claude Code | `TeamID=Q6L2SF6YDW` + `SigningID=com.anthropic.claude-code` |
| Codex | `TeamID=2DC432GLL2` + `SigningID=codex` |
| kubectl | `BinaryPath=/opt/homebrew/bin/kubectl` |
| 腾讯云 CLI | `BinaryPath=/Users/lens/.local/bin/tccli` |
| 腾讯云 CLI | `BinaryPath=/Users/lens/.local/bin/tccli` |
| GitHub CLI | `BinaryPath=/opt/homebrew/bin/gh` |

签名匹配通常优于单独匹配路径。对于无稳定签名的 Homebrew 二进制，可以先用固定 `BinaryPath` 审计；升级后重新检查文件路径和签名。

## 4. 创建 FAA 策略

建立工作目录：

```bash
mkdir -p "$HOME/santa-security"
chmod 700 "$HOME/santa-security"
```

创建 `$HOME/santa-security/faa.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Version</key><string>credentials-v1-audit</string>
  <key>WatchItems</key>
  <dict>
    <key>SSHPrivateKeys</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/.ssh/id_*</string></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><false/>
        <key>AuditOnly</key><true/>
        <key>BlockMessage</key><string>Unauthorized SSH private-key access.</string>
      </dict>
      <key>Processes</key><array>
        <dict><key>PlatformBinary</key><true/><key>SigningID</key><string>com.apple.ssh</string></dict>
        <dict><key>PlatformBinary</key><true/><key>SigningID</key><string>com.apple.ssh-agent</string></dict>
      </array>
    </dict>

    <key>SSHConfigKnownHostsWrite</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/.ssh/config</string></dict>
        <dict><key>Path</key><string>/Users/*/.ssh/known_hosts</string></dict>
        <dict><key>Path</key><string>/Users/*/.ssh/known_hosts.old</string></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><true/>
        <key>AuditOnly</key><true/>
      </dict>
      <key>Processes</key><array>
        <dict><key>PlatformBinary</key><true/><key>SigningID</key><string>com.apple.ssh</string></dict>
      </array>
    </dict>

    <key>DockerCredentials</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/.docker/config.json</string></dict>
        <dict><key>Path</key><string>/Users/*/.docker/contexts/</string><key>IsPrefix</key><true/></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><false/>
        <key>AuditOnly</key><true/>
        <key>BlockMessage</key><string>Unauthorized Docker credential access.</string>
      </dict>
      <key>Processes</key><array>
        <dict><key>TeamID</key><string>9BNSXJN65R</string></dict>
      </array>
    </dict>

    <key>DockerSettings</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/Library/Group Containers/group.com.docker/</string><key>IsPrefix</key><true/></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><true/>
        <key>AuditOnly</key><true/>
        <key>BlockMessage</key><string>Only Docker Desktop can modify these settings.</string>
      </dict>
      <key>Processes</key><array>
        <dict><key>TeamID</key><string>9BNSXJN65R</string></dict>
      </array>
    </dict>

    <key>KubernetesCredentials</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/.kube/config</string></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><false/>
        <key>AuditOnly</key><true/>
        <key>BlockMessage</key><string>Unauthorized Kubernetes credential access.</string>
      </dict>
      <key>Processes</key><array>
        <dict><key>BinaryPath</key><string>/opt/homebrew/bin/kubectl</string></dict>
      </array>
    </dict>

    <key>ClaudeCredentials</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/.claude/</string><key>IsPrefix</key><true/></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><false/>
        <key>AuditOnly</key><true/>
        <key>BlockMessage</key><string>Unauthorized Claude credential access.</string>
      </dict>
      <key>Processes</key><array>
        <dict><key>TeamID</key><string>Q6L2SF6YDW</string><key>SigningID</key><string>com.anthropic.claude-code</string></dict>
      </array>
    </dict>

    <key>CodexCredentials</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/.codex/</string><key>IsPrefix</key><true/></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><false/>
        <key>AuditOnly</key><true/>
        <key>BlockMessage</key><string>Unauthorized Codex credential access.</string>
      </dict>
      <key>Processes</key><array>
        <dict><key>TeamID</key><string>2DC432GLL2</string><key>SigningID</key><string>codex</string></dict>
      </array>
    </dict>

    <key>TccliCredentials</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/.tccli/default.credential</string></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><false/>
        <key>AuditOnly</key><true/>
        <key>BlockMessage</key><string>Unauthorized Tencent Cloud credential access.</string>
      </dict>
      <key>Processes</key><array>
        <dict><key>BinaryPath</key><string>/Users/lens/.local/bin/tccli</string></dict>
      </array>
    </dict>

    <key>GitHubCLIAuth</key><dict>
      <key>Paths</key><array>
        <dict><key>Path</key><string>/Users/*/.config/gh/</string><key>IsPrefix</key><true/></dict>
      </array>
      <key>Options</key><dict>
        <key>RuleType</key><string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key><false/>
        <key>AuditOnly</key><true/>
        <key>BlockMessage</key><string>Unauthorized GitHub CLI credential access.</string>
      </dict>
      <key>Processes</key><array>
        <dict><key>BinaryPath</key><string>/opt/homebrew/bin/gh</string></dict>
      </array>
    </dict>
  </dict>
</dict>
</plist>
```

规则名必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`。不要在 `WatchItems` 的名称中使用空格、连字符、点号或中文。

## 5. 安装 detached FAA 配置

先校验工作副本：

```bash
plutil -lint "$HOME/santa-security/faa.plist"
```

安装到系统目录：

```bash
sudo mkdir -p "/Library/Application Support/Santa"
sudo cp "$HOME/santa-security/faa.plist" \
  "/Library/Application Support/Santa/faa.plist"
sudo chown root:wheel "/Library/Application Support/Santa/faa.plist"
sudo chmod 600 "/Library/Application Support/Santa/faa.plist"
sudo plutil -lint "/Library/Application Support/Santa/faa.plist"
```

Santa 的主配置需要包含：

```xml
<key>FileAccessPolicyPlist</key>
<string>/Library/Application Support/Santa/faa.plist</string>

<key>FileAccessPolicyUpdateIntervalSec</key>
<integer>60</integer>
```

该设置可以由组织的 MDM 配置，也可以由本机已有的 Santa 管理配置提供。不要用 `profiles show` 判断 detached FAA 文件是否工作；最终以 `santactl status` 为准。

成功状态如下：

```text
>>> Watch Items
  Enabled          | Yes
  Data Source      | Detached config file
  Config Path      | /Library/Application Support/Santa/faa.plist
  Policy Version   | credentials-v1-audit
  Rule Count       | 8
```

`profiles show -type configuration` 可能显示没有已安装 profile。这与 detached FAA 是否已加载不是同一个判断维度。

## 6. 验证每条路径

精确文件可以直接检查：

```bash
sudo santactl rule --check --file-access --path "$HOME/.ssh/id_ed25519"
sudo santactl rule --check --file-access --path "$HOME/.docker/config.json"
sudo santactl rule --check --file-access --path "$HOME/.kube/config"
```

对于使用 `IsPrefix=true` 的目录规则，应检查目录内的实际文件，而不是目录本身：

```bash
sudo santactl rule --check --file-access --path "$HOME/.claude/settings.json"
sudo santactl rule --check --file-access --path "$HOME/.codex/auth.json"
sudo santactl rule --check --file-access --path "$HOME/.config/gh/hosts.yml"
```

预期输出示例：

```text
Data File Access Rule
     Name: CodexCredentials
  Version: credentials-v1-audit
```

## 7. 审计正常工作流

先运行会真实使用凭证的命令：

```bash
ssh your-host
docker login
docker pull alpine
kubectl config current-context
claude --version
codex --version
gh auth status
```

然后用未授权程序触发审计事件：

```bash
/bin/cat "$HOME/.ssh/id_ed25519" >/dev/null
/usr/bin/python3 -c 'open("'"$HOME"'/.docker/config.json").read()'
```

当前 `AuditOnly=true`，这些测试不会因为 FAA 被阻止。

查看包含 info 级别的日志：

```bash
log show --last 10m \
  --info \
  --style compact \
  --predicate 'process == "com.northpolesec.santa.daemon"'
```

按关键词过滤：

```bash
log show --last 10m \
  --info \
  --style compact \
  --predicate 'process == "com.northpolesec.santa.daemon"' \
  | grep -Ei 'file|access|watch|policy|faa|denied|blocked|audit'
```

不加 `--info` 时，`log show` 会跳过 info 和 debug 事件，容易误判为没有日志。

## 8. 从审计切换到阻断

先逐条确认合法工作流使用的进程都已经列入白名单。然后只修改准备启用的规则：

```xml
<key>AuditOnly</key>
<false/>
```

建议顺序：

1. GitHub CLI 凭证。
2. Docker 凭证。
3. Claude Code 凭证。
4. Codex 凭证。
5. Kubernetes 凭证。
6. SSH 私钥。

每次只切换一条，重新安装策略并验证：

```bash
plutil -lint "$HOME/santa-security/faa.plist"
sudo cp "$HOME/santa-security/faa.plist" \
  "/Library/Application Support/Santa/faa.plist"
sudo chown root:wheel "/Library/Application Support/Santa/faa.plist"
sudo chmod 600 "/Library/Application Support/Santa/faa.plist"
```

等待 `FileAccessPolicyUpdateIntervalSec` 指定的间隔后检查：

```bash
santactl status
```

`Last Policy Update` 应更新。随后重新验证正常命令和未授权读取。

## 9. 以后添加一条规则

新增规则时遵循固定流程：确定敏感路径、确认允许进程身份、先审计、验证日志、最后阻断。

例如只允许 AWS CLI 读取 AWS 凭证：

```xml
<key>AWSCredentials</key>
<dict>
  <key>Paths</key>
  <array>
    <dict><key>Path</key><string>/Users/*/.aws/credentials</string></dict>
    <dict><key>Path</key><string>/Users/*/.aws/config</string></dict>
  </array>
  <key>Options</key>
  <dict>
    <key>RuleType</key><string>PathsWithAllowedProcesses</string>
    <key>AllowReadAccess</key><false/>
    <key>AuditOnly</key><true/>
    <key>BlockMessage</key><string>Unauthorized AWS credential access.</string>
  </dict>
  <key>Processes</key>
  <array>
    <dict><key>BinaryPath</key><string>/opt/homebrew/bin/aws</string></dict>
  </array>
</dict>
```

把该 `<key>AWSCredentials</key><dict>...</dict>` 放入现有 `WatchItems` 字典，不要创建第二个 `WatchItems`。然后执行：

```bash
command -v aws
santactl fileinfo "$(command -v aws)"
plutil -lint "$HOME/santa-security/faa.plist"
```

部署后验证：

```bash
sudo santactl rule --check --file-access --path "$HOME/.aws/credentials"
```

如果 AWS CLI 通过 Python、浏览器、SSO Helper 或其他辅助程序读取凭证，审计日志会显示真实访问者。只添加确实必要且身份稳定的进程，不要为了消除日志而放行整个解释器或 Shell。

## 10. 维护清单

工具升级、路径变化或增加新凭证后执行以下检查：

```bash
santactl status
sudo santactl doctor
plutil -lint "$HOME/santa-security/faa.plist"
santactl fileinfo "$(command -v docker)"
santactl fileinfo "$(command -v kubectl)"
santactl fileinfo "$(command -v claude)"
santactl fileinfo "$(command -v codex)"
```

长期建议：

- 优先使用 macOS Keychain、硬件安全密钥和短期令牌。
- Docker 使用 `osxkeychain` credential store。
- Kubernetes 使用 OIDC 或 `exec` 登录插件，避免长期管理员证书。
- 云平台使用短期凭证，不在配置文件中保存长期 Access Key。
- 不把 FAA 策略文件交给普通用户或开发工具写入。
- 避免路径重叠。多个 FAA 规则覆盖同一路径时，应用哪条规则可能未定义。
- 使用真实解析后的路径；FAA 不可靠支持符号链接目标和既有硬链接绕过场景。

## 参考资料

- [Santa 项目](https://github.com/northpolesec/santa)
- [File Access Authorization 配置](https://northpole.security/docs/santa/configuration/faa)
- [FAA Cookbook](https://northpole.security/docs/santa/cookbook/faa)
- [Santa 故障排查](https://northpole.security/docs/santa/deployment/troubleshooting)
