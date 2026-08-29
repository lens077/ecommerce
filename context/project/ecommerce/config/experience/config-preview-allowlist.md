---
name: config-preview-allowlist
module: config
description: Config Center 整份 Bootstrap 预览使用跨行正则时越过段边界，邻接凭据进入工具日志
---

# Config Center 预览必须使用字段 allowlist

## 症状

为了确认某个非敏感配置段，脚本先对文本做正则截取和 `api_key` 替换，再把结果打印到终端。预期只输出 `recommend.gorse`，实际却把后续顶层段一并输出，邻接的密码字段进入工具日志。

## 关键陷阱

Bootstrap 是一整份 YAML，当前条目因业务读取需要仍为 `is_secret=false`。`GetKey` 返回值因此可能同时包含数据库、搜索、对象存储和第三方 API 凭据。

正则使用了跨行模式，并在「缩进行」匹配中保留了贪婪 `.*`。它越过目标段边界后，后续再只替换 `api_key` 已经没有意义。这里的问题不是少列了一个敏感字段，而是「先打印大块文本，再尝试 blacklist 脱敏」这个方法本身不成立。

## 固定做法

1. API 响应只写入权限为 `0600` 的临时文件；从创建开始设置 `trap` 删除。不得使用 `set -x`。
2. 解析外层 JSON，再用 YAML parser 解析 `entry.value`。stdout 只输出显式 allowlist，例如 `entry.version`、`recommend.gorse.enable`、endpoint host 和「key 是否为空/长度/哈希前缀」。
3. 不得打印原始 YAML、顶层段或任意正则截取块。递归遮盖 `password`、`secret`、`token`、`api_key`、`authorization` 只能作为第二道防线，不能替代 allowlist。
4. 管理员更新时在内存中修改完整值，以读取到的 version 做乐观并发控制；请求完成后立即清理 token、旧值和新值临时文件。
5. 日志和报告只记录 namespace/environment/key、旧新 version、变更字段名、字节数与摘要，不记录字段值。

## 回归验证

安全预览的测试 fixture 必须把目标段和多个邻接 secret 放在同一份 YAML：

```yaml
recommend:
  gorse:
    endpoint: https://example.invalid
    api_key: fixture-key
search:
  elastic_search:
    password: fixture-password
auth:
  client_secret: fixture-secret
```

断言 stdout 只包含 allowlist 字段与布尔/长度/摘要，三个 fixture secret 均不得出现。再故意增加未知的 `credential` 字段，确认预览仍不会因 blacklist 漏项而输出它。

## 事故记录

2026-08-28 在预览 product dev Bootstrap 时，跨行正则越过 `recommend` 边界，一个既有搜索凭据进入会话工具输出。临时响应文件已删除，凭据未写入仓库；由于工具日志不可撤回，该凭据应按已暴露处理并在管理窗口轮换。后续所有 Config Center 检查统一执行上面的 parser + allowlist 规则。
