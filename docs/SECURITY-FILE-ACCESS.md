# 文件路径与目录遍历防护

> 范围：任何把**请求中的值**变成**文件系统路径**的代码——下载、导出、模板渲染、日志查看、
> 静态文件、上传落盘、配置读取。访问控制总则见 [TECH.md §8.5](TECH.md#85-服务端访问控制准则)，
> 本文是它在文件系统这一类资源上的具体化。
>
> 现状〔审计 2026-09-08〕：本仓与 control-tower 的所有 `os.ReadFile` / `filepath.Join` 参数都来自
> 配置或环境变量（证书、CA、路由表目录 + 固定键名、CLI 工具），**没有一处把请求参数拼进路径**；
> 配置中心数据存 Postgres 而非文件；网关拒绝 `%2F` 等转义路径（`PATH_ESCAPED`）。
> 本文约束的是**将来新增**的这类接口。

## 攻击是怎么成立的

```text
GET /download?file=report.pdf          ← 设计意图
GET /download?file=../../../etc/passwd ← 攻击
```

服务端若写成 `os.ReadFile("/srv/files/" + file)`，内核把 `/srv/files/../../../etc/passwd` 解析为 `/etc/passwd`。

常见变体：

| 变体 | 示例 | 挡它的不是「过滤 `..`」而是 |
|---|---|---|
| URL 编码 / 双重编码 | `%2e%2e%2f`、`%252e%252e%252f` | 规范化后再验证 |
| 绝对路径 | `file=/etc/passwd` | 拒绝 `filepath.IsAbs` |
| 反斜杠 | `..\..\` | 只认 `/`，或统一走 `os.Root` |
| 符号链接 | `/srv/files/link → /etc` | 内核级限制（`os.Root`）或 `EvalSymlinks` 后再验前缀 |
| 空字节截断 | `report.pdf%00.jpg` | 现代 Go 运行时已拒绝 NUL；仍按白名单校验文件名 |

`/etc/passwd` 只是靶子。真正值钱的是：`.env`、应用配置里的数据库口令、私钥、`~/.ssh`、源码、
容器里挂载的 Secret（`/var/run/secrets/...`）。

## 防护：按优先级

### 1. 不让用户提供路径（根治）

用户给 **ID**，路径由服务端查表得到，顺带做资源归属检查：

```go
rec, err := files.Get(ctx, req.FileID)
if err != nil {
    return notFound()
}
if rec.OwnerID != subject.UserID {          // subject 来自服务端会话，见 TECH.md §8.5 原则二
    return forbidden()
}
path := filepath.Join(baseDir, rec.StorageKey) // StorageKey 是服务端生成的 UUID，不含用户输入
```

文件名是「不该由客户端说了算」的典型：客户端原始文件名只作展示元数据入库，**永不参与路径拼接**。

### 2. 必须接受路径时：规范化 + 前缀验证

`filepath.Join` **不够**——它会 Clean 掉 `..`，但 `Join("/srv", "../../etc")` 得到 `/etc`。

```go
func safeJoin(base, userPath string) (string, error) {
    if filepath.IsAbs(userPath) {
        return "", errUnsafePath
    }
    full := filepath.Join(base, userPath)
    rel, err := filepath.Rel(base, full)
    if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
        return "", errUnsafePath
    }
    return full, nil
}
```

**Go 1.24+ 优先用 `os.Root`**：在内核层面把所有操作限制在目录内，`..` 与符号链接逃逸一并挡住，
不需要自己做字符串判断：

```go
root, err := os.OpenRoot("/srv/files")
if err != nil { return err }
f, err := root.Open(userPath) // 指向 root 之外的任何路径都返回错误
```

### 3. 白名单优于黑名单

不要过滤 `..`——编码变体太多。只接受允许的形状：

```go
var safeName = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}\.(pdf|png|jpg)$`)
```

### 4. 让偷到也没用（纵深）

- 进程以**非 root 用户**运行，文件权限最小化——遍历成功也读不到 `/etc/shadow`
- 容器 `readOnlyRootFilesystem: true`，Secret 走环境变量或 tmpfs 挂载
- 敏感配置不落盘（Config Center 已是这个模型）
- 静态资源走对象存储 + 预签名 URL，应用进程不碰文件系统

## 容易漏的地方

- **框架静态文件服务**：`http.FileServer(http.Dir("./static"))` 本身安全（内部做了 Clean 与前缀限制）；
  但在它前面自己改写路径、或用 `http.Dir("")` / `http.Dir("/")`，防护就没了。
- **Nginx `alias` 少一个斜杠**：`location /static { alias /srv/static/; }` → `/static../etc/passwd`。
  用 `root` 或保证 `location` 与 `alias` 同样以 `/` 结尾。
- **压缩包解压（Zip Slip）**：逐条目对 entry 名做第 2 节的检查，再写盘。
- **模板引擎的 include / 日志查看器的文件名参数**：同属本文范围，同样只接受 ID 或白名单。

## 新增接口前自查

- 请求里有没有值最终变成了路径？（文件名、模板名、日志名、语言包、主题）
- 能否改成 ID → 服务端查路径？
- 若必须接受路径：是否 `os.Root`，或「拒绝绝对路径 + Join + Rel 前缀验证」？
- 文件名是否白名单校验？
- 基目录下有没有符号链接？进程是否非 root、根文件系统是否只读？
- 有没有一条用 `../`、`%2e%2e`、绝对路径三种输入的回归测试？
