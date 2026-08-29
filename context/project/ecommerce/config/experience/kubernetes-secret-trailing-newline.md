---
name: kubernetes-secret-trailing-newline
module: config
description: 通过文件创建 Kubernetes Secret 时保留末尾换行，令牌进入 HTTP Authorization 头后触发 invalid header field value
---

# Secret 值末尾换行导致 Authorization 头无效

## 症状

search indexer 使用新建的 Meilisearch writer key 启动。Deployment 一度显示 Ready，但进程随后
退出并重启，日志为：

```text
net/http: invalid header field value for "Authorization"
```

## 关键陷阱

`jq -r '.key' > key-file` 会在标量后写入换行。`kubectl create secret --from-file` 按字节
保留文件内容，容器读取的 API key 因此以 `LF` 结尾。Go HTTP 客户端拒绝把控制字符写入
`Authorization` 头。

Kubernetes Secret、base64 编码和 Pod 环境变量都工作正常；问题是 Secret 原始值多了一个
不可见字节。只看 Secret 名称、key 名称或字符串长度很容易漏掉。

## 处理方式

1. 生成标量令牌文件时，使用 `printf '%s' "$value"`，不要使用 `echo`。
2. 上游工具必然输出换行时，先对标量令牌执行 `tr -d '\r\n'`，再创建 Secret。
3. 不输出令牌本身，只检查末尾字节、预期长度范围和 API 鉴权结果。
4. 更新 Secret 后，重启不会自动重读环境变量的 Deployment。
5. 如果处理过程创建了替代 key，确认新 Pod 正常消费后再撤销旧 key。

此规则只适用于单行密码、token 和 API key。不要对 PEM、证书链、YAML 或其他多行内容执行
`tr -d '\r\n'`；删除这些内容的换行会破坏格式。

**后续决策覆盖（2026-08-28）**：本条结论已被 docs/TECH.md 覆盖：搜索目标为隐藏在 `SearchCatalog` 接口后的 Elasticsearch 只读投影；Meilisearch 仅为存量待迁，Secret 换行处理规则仍然有效。
