# GO-TOOLCHAIN.md — Go 工具链速查（2026 版）

> **这份文件回答一个问题**：某个 Go 任务该先试哪条命令。
>
> - 提交前必跑的锚点 → [`context/team/runbook.md`](../context/team/runbook.md)
> - 测试写不写、写在哪层 → [`context/team/go-testing.md`](../context/team/go-testing.md)
> - 测试环境与数据准备 → [`docs/TESTING.md`](TESTING.md)
>
> 来源：Alex Edwards《An Overview of Go's Tooling: Version 2》的完整中文译文（Tony Bai，2026-11-25；原文 2026-11-24）。示例基线是 Go 1.27.x，本仓 [`backend/go.mod`](../backend/go.mod) 声明 `go 1.27.0`。
> 原文的视频、截图与课程推广已删，只留命令与判断；完整论证看原文。
>
> ⚠️ 这是**速查，不是规则**。仓库该跑什么由 CI 与脚本决定，最后一章给出现状查法。

---

## 一、运行第三方工具：三种方式

| 方式 | 命令 | 版本记在哪 | 用在哪 |
|---|---|---|---|
| 全局安装 | `go install pkg@latest` | `GOBIN`（`go env GOBIN`） | 与项目无关、长期复用的工具：`hey`、`dlv` |
| 临时执行 | `go run pkg@latest ./...` | 不落地，每次解析最新 | 评审时跑最新版；个人小项目不想管版本 |
| 模块工具依赖 | `go get -tool pkg@latest`，之后 `go tool xxx` | `go.mod` 的 `tool` 指令 + `go.sum` | 团队要可重现（Go 1.24+） |

```bash
# 全局安装
$ go install golang.org/x/vuln/cmd/govulncheck@latest
$ which govulncheck

# 不落地，跑最新版
$ go run golang.org/x/vuln/cmd/govulncheck@latest ./...

# 钉进模块（团队场景首选）
$ go get -tool golang.org/x/vuln/cmd/govulncheck@latest
$ cat go.mod          # 出现: tool golang.org/x/vuln/cmd/govulncheck
$ go tool govulncheck ./...
```

`@latest` 在每台机器上解析到的版本可能不同，CI 的结论就复现不出来。团队一致性只由第三种保证。

## 二、开发

### 编辑器与语言服务器

`gopls` 是官方 LSP 服务器，能力覆盖：自动补全、语义高亮、悬停文档、折叠、诊断、跳转定义/引用/实现、智能重命名、整理 `import`、调整参数顺序、生成测试骨架。

```bash
$ go install golang.org/x/tools/gopls@latest
```

- Zed、Helix 自动探测，不需要配置。
- VS Code 装 `golang.go` 扩展；状态栏 Go 版本旁出现闪电图标即语言服务器已运行。
- Vim/Neovim、Emacs、Sublime 各有官方配置页。

### 文档与环境信息

```bash
$ go doc bytes                 # 包简化文档
$ go doc -all bytes            # 包完整文档
$ go doc bytes.Buffer          # 类型
$ go doc -src bytes.Replace    # 连带源码
$ go doc -http bytes           # Go 1.25+: 起本地文档服务器，浏览器看
$ go env                       # 当前环境全量
$ go env GOPATH GOOS GOARCH    # 只取值
$ go help environment          # 所有 env 变量的文档
```

### 格式化与模块文件整理

```bash
$ gofmt -w -s -d foo.go    # 就地写回 + 简化 + 输出 diff
$ gofmt -w -s -d .         # 递归整棵树（gofmt 本身递归）
$ gofmt -l .               # 只列文件名；CI 审计用它，要求输出为空
$ go fmt ./...             # 本质是 gofmt -l -w 的封装
$ go run golang.org/x/tools/cmd/goimports@latest -w .   # 额外增删排序 import

$ go mod tidy              # 补缺失、删不用
$ go mod tidy -diff        # 只打印差异，不改文件；有变更即非零退出码
```

`go mod tidy -diff` 是 CI 形状的工具：有变更打印并以非零码退出，无变更退出码 0。
另外它覆盖所有 build tag 与 GOOS/GOARCH 组合，而 `go run`/`go test`/`go build` 只看当前构建配置，所以 tidy 之后模块文件偶尔会「多出几行」，那是正常的。

### 调试、现代化、重构、实时重载

```bash
$ go install github.com/go-delve/delve/cmd/dlv@latest
$ dlv debug ./cmd/web            # 终端交互式调试

$ go tool fix help               # 列出全部现代化分析器
$ go fix ./...                   # ⚠️ 静默就地重写
$ go fix -diff ./...             # 先看 diff 再决定
$ go fix -diff -embedlit=false -mapsloop=false ./...   # 单项关闭

$ go run github.com/air-verse/air@latest -c .air.toml  # 实时重载
```

`go fix` 从 Go 1.26 起重建：`interface{}` → `any`、手写循环 → `slices.Contains()`、`errors.As` → `errors.AsType[T]`、`atomic` 基础类型、`embedlit` 复合字面量、`forvar` 冗余循环变量。
`modernize` 包的分析器已全部并入 `go fix`，它是官方推荐的唯一入口。

重构首选 gopls 的代码变换；没有 gopls 时退回 `gofmt -r` 重写规则。

### AI 编码助手与 MCP

```bash
$ gopls mcp -instructions > ./agents/instructions/gopls.md
```

`gopls` 内置实验性 MCP 服务器，把编辑器同款语义能力暴露给 Claude Code、OpenAI Codex 一类的助手；
按 Go 官方 MCP 文档配置即可。另一个省 token 的选择是 `mrjoshuak/godoc-mcp`，让助手查包文档而不是通读源码。

## 三、代码质量

### 安全

```bash
$ go run golang.org/x/vuln/cmd/govulncheck@latest ./...
$ go run github.com/securego/gosec/v2/cmd/gosec@latest ./...
```

`govulncheck` 只标记**真正影响到你**的漏洞：漏洞落在你没用到的代码路径上就不报。
它比「扫依赖清单」的扫描器噪音低得多，适合放进发版前流程。

`gosec` 的误报用带规则号与理由的注释抑制，别直接删规则：

```go
// #nosec G404 -- deliberate use of a deterministic RNG
rng := rand.New(rand.NewPCG(442, 4231))
```

### 正确性

| 工具 | 定位 | 关键参数 |
|---|---|---|
| `go vet` | 第一站，检查少、信噪比高 | 默认设置；`go tool vet help` 看 analyzer 清单；单项关闭用 `-composites=false` |
| `staticcheck` | 「开了挂的 go vet」，约 160 项检查 | 默认只跑子集；首轮 `-checks=all`；排除用 `-checks=all,-ST1000,-ST1020` |
| `nilaway` | 查潜在 nil panic，比 nilness 全面 | `-exclude-test-files` 只看生产代码 |
| `errcheck` | 未处理错误 | 默认只报完全未处理；`-blank` 把赋给 `_` 的也算；`-exclude=...` 排除约定可忽略者 |
| `shadow` | 变量遮蔽 | 以吵著称，从未进默认 vet；评审大代码库时偶尔跑 |

```bash
$ go vet ./...
$ go run honnef.co/go/tools/cmd/staticcheck@latest -checks=all ./...
$ go run go.uber.org/nilaway/cmd/nilaway@latest -exclude-test-files ./...
$ go run github.com/kisielk/errcheck@latest -blank ./...
$ go run golang.org/x/tools/go/analysis/passes/shadow/cmd/shadow@latest ./...
```

`errcheck` 有个默认边界要记住：它只报完全没处理的错误，`_ = f()` 这种「假装处理」默认放过，要 `-blank` 才纳入。反过来，并非每个错误都值得处理——按惯例 `http.ResponseWriter.Write()` 与 `fmt.Fprint()` 的错误常被忽略，这类用排除文件表达，而不是逐处加注释。

### 卫生

```bash
$ go run github.com/mgechev/revive@latest -formatter=stylish ./...   # 风格与惯例
$ go run golang.org/x/tools/cmd/deadcode@latest -test ./...          # 死代码；⚠️ 必须加 -test
$ go run github.com/tomarrell/wrapcheck/v2/cmd/wrapcheck@v2 ./...    # 漏包错误
```

- `revive` 是 `golang/lint` 的精神续作，与 staticcheck 有重叠，但偏风格；多贡献者项目价值最大。
  `-config` 传 TOML 可禁用或自定义规则。
- `deadcode` 默认**不看 `_test.go`**，只被测试引用的函数会被误报成死代码，所以 `-test` 几乎是必需的。
- `deadcode -whylive=pkg.Func` 反过来回答「这个函数为什么还活着」：输出从 `main()` 到目标的最短调用链，
  每一跳带 `static@L` 或 `dynamic@L` 标注。

### 一次跑多个工具

```bash
$ golangci-lint run ./...        # 统一并行跑 + 统一输出
```

或者一个只有 `audit` 目标的 Makefile。本仓走基线棘轮，见最后一章。

## 四、依赖管理

```bash
$ go install golang.org/dl/go1.26.0@latest && go1.26.0 download   # 并存多个 Go 版本
$ GOTOOLCHAIN=local go1.26.0 version                             # 关掉自动工具链切换
$ go run github.com/oligot/go-mod-upgrade@latest ./...           # 交互式列可升级项

$ go work init .                        # 工作区：用本地 fork 取代 replace 规则
$ go work use /local/code/mydep
$ cd /local/code && go work init ./a ./b  # 两个互相依赖的模块

$ go mod why -m golang.org/x/sys        # 这个依赖从哪来
$ go mod graph                          # 纯文本依赖图
$ go clean -modcache                    # 清模块缓存（影响全机所有项目）
```

- 被 `go work use` 的模块仍需自己的 `go.mod`，模块路径必须与 import 路径一致。
- `go mod why` 对大多数但非全部依赖能给出答案（golang/go#27900 仍未关闭）。
- `go mod graph` 不画图；可视化用 `samber/go-mod-graph`、`bayraktugrul/modview`，
  或者把文本输出交给 AI 画。
- Go 1.21+ 会自动下载并使用更匹配的工具链，`GOTOOLCHAIN=local` 才是「就用我装的这个版本」。

## 五、测试

```bash
$ go test ./...
$ go test -race ./...             # 并发代码必开
$ go test -buildvcs ./...         # 测试要读 debug.BuildInfo 的 VCS 信息时
$ go test -v -run=^TestFooBar$ .
$ go test -v -run=^TestFooBar$/^Baz$ .   # 子测试
$ go test -count=1 ./...          # 绕过测试缓存（结果里的 (cached) 就是它在起作用）
$ go clean -testcache             # 让所有缓存结果过期
$ go test -failfast ./...
$ go run gotest.tools/gotestsum@latest -- ./...   # 更漂亮的 go test 输出
```

`-failfast` 只在同包内生效：`go test ./...` 时其他包的测试照跑完。

### 覆盖率

```bash
$ go test -cover ./...                                        # 百分比
$ go test -coverprofile=/tmp/profile.out ./... && go tool cover -html=/tmp/profile.out
$ go test -covermode=atomic -coverprofile=/tmp/profile.out ./... # 记录每条语句执行次数
$ go tool cover -func=/tmp/profile.out                        # 无浏览器时按函数看
```

### 负载

```bash
$ go run github.com/rakyll/hey@latest -n 10000 -c 100 http://localhost:5051
```

要更复杂的能力（脚本化场景、指标导出）看 `tsenart/vegeta` 或 `grafana/k6`；k6 的场景用 JS 写。

### 压力：重复跑同一个测试

```bash
$ go test -run=^TestFooBar$ -count=500 ./...        # 串行重复
$ go test -c -o=/tmp/foo.test .                     # 先编测试二进制
$ go run golang.org/x/tools/cmd/stress@latest -p=4 /tmp/foo.test -test.run=^TestFooBar$
```

`-count` 是串行的：`t.Parallel()` 只在每次执行内部生效，各次重复之间不重叠。要并行重复用 `stress`，`-p` 不给时默认 `runtime.NumCPU()`。

### 模糊测试

```bash
$ go test -fuzz=^FuzzSlugify$ ./cmd/web/         # 真正开始 fuzz
$ go test -fuzz=^FuzzSlugify$ -fuzztime=30s ./cmd/web/
```

- 普通 `go test` 只跑种子语料（`f.Add()` 提供的那几条）；`-fuzz` 才随机生成输入。
- **一次只能一个模糊测试，且不能用 `./...`**：正则匹配到多个会报 `-fuzz matches more than one fuzz test`。
- 失败输入落在包的 `testdata/fuzz/<FuzzName>/<hash>`，之后普通 `go test` 也会回放，
  等于自动把回归用例钉死。
- 不设 `-fuzztime` 会一直跑；「new interesting」计数趋平就是边际收益见底的信号。

## 六、构建与二进制

```bash
$ go mod verify                                  # 构建前确认模块缓存未被动过
$ go build -o=/tmp/foo .
$ go build -o=/tmp/foo ./cmd/foo
$ go build -a -o=/tmp/foo .                      # 强制重建（cgo 的 C 库改动只有它看得见）
$ go clean -cache                                # 或清构建缓存
$ go build -a -v -o=/tmp/foo .                   # 打包名
$ go build -a -x -o=/tmp/foo .                   # 打实际执行的命令

$ GOOS=linux GOARCH=amd64 go build -o=/tmp/linux_amd64/foo .
$ go tool dist list                             # 全部 GOOS/GOARCH 组合

$ go tool compile -help                         # 编译器和链接器的全部标志
$ go tool link -help
$ go build -ldflags="-X main.foo=bar" -o=/tmp/foo .   # 把字符串烧进变量（版本号注入）

$ go build -ldflags="-s" -o=/tmp/foo .          # 剥符号表与 DWARF，典型缩 ~25%
$ upx /tmp/foo                                  # 非 Go 专属，进一步压缩

$ go tool buildid /tmp/foo                      # 构建指纹；同输入必同 ID
$ go version -m /tmp/foo                        # 版本、模块、依赖、CGO_*/GOAMD64、VCS 信息
```

`go version -m` 输出里 `vcs.revision`、`vcs.time`、`vcs.modified` 三行是二进制溯源的主要依据；
`buildid` 用来验证可重现构建——同输入不同 ID 说明两次构建存在真实差异。

## 七、诊断与优化

### 基准测试

```bash
$ go test -run=^$ -bench=. -benchmem ./...            # 只跑基准，不跑普通测试
$ go test -run=^$ -bench=^BenchmarkFoo$ ./...
$ go test -run=^$ -bench=. -benchtime=5s ./...          # 时长
$ go test -run=^$ -bench=. -benchtime=500x ./...        # 固定迭代
$ go test -run=^$ -bench=. -count=3 ./...               # 重复 3 遍
$ go test -run=^$ -bench=. -cpu=1,4,8 ./...             # 看 GOMAXPROCS 的影响

$ go test -run=^$ -bench=. -benchmem -count=10 ./... > result.txt
$ go run golang.org/x/perf/cmd/benchstat@latest result.txt
$ go run golang.org/x/perf/cmd/benchstat@latest before.txt after.txt   # 前后对比 + p 值
```

`benchstat` 已取代废弃的 `benchcmp`；`-count=10` 之后它给的是中位数与置信区间，而不是单次结果，这才是能下结论的形状。

### 剖析

```bash
# 测试驱动
$ go test -run=^$ -bench=^BenchmarkFoo$ -cpuprofile=/tmp/cpuprofile.out .
$ go test -run=^$ -bench=^BenchmarkFoo$ -memprofile=/tmp/memprofile.out .
$ go test -run=^$ -bench=^BenchmarkFoo$ -blockprofile=/tmp/blockprofile.out .
$ go test -run=^$ -bench=^BenchmarkFoo$ -mutexprofile=/tmp/mutexprofile.out .
$ go test -run=^$ -bench=^BenchmarkFoo$ -o=/tmp/foo.test -cpuprofile=/tmp/cpuprofile.out .

# 查看
$ go tool pprof -http=:5000 /tmp/cpuprofile.out
$ go tool pprof --nodefraction=0.1 -http=:5000 /tmp/cpuprofile.out   # 忽略 <10% 的节点

# 从跑着的 Web 应用直接拉 30 秒 CPU 剖析
$ go tool pprof -http=:5000 http://localhost:4000/debug/pprof/profile?seconds=30
```

三条生成路径：Web 应用导 `net/http/pprof`（注册在 `http.DefaultServeMux`，换 mux 要自行注册）；
其他应用用 `runtime/pprof` 的 `StartCPUProfile()` / `WriteHeapProfile()`；测试用各种 `-***profile` 标志。
`-http` 默认火焰图，还能切 top、源码、调用图视图。

### PGO（剖析引导优化）

```bash
$ go build -pgo=/tmp/cpuprofile.out ./cmd/web
$ cp /tmp/cpuprofile.out ./cmd/web/default.pgo    # 或命名为 default.pgo，自动生效
```

工作流：从生产采代表性剖析 → 引导下一版构建 → 随版本演进定期重采。
收益主要来自更激进的内联与热点路径布局，所以采样的「代表性」比采样量重要。

### 执行追踪

```bash
$ go test -run=^$ -bench=^BenchmarkFoo$ -trace=/tmp/trace.out .
$ go tool trace /tmp/trace.out
```

剖析回答「谁在耗 CPU」，追踪回答「goroutine 为什么阻塞、请求为什么慢」：
它记录调度、系统调用、GC 等运行时事件，浏览器里按时间轴看。

### 竞态

```bash
$ go test -race ./...
$ go build -race -o=/tmp/foo .
$ GORACE="log_path=/tmp/race" /tmp/foo
```

`-race` 构建更耗 CPU 与内存，**不要进生产二进制**；可在一台机器上部署或对压测流量使用。
难复现的疑点可再用 `amit-davidson/Chronos` 做静态检查。

## 八、版本门槛

| 版本 | 变化 |
|---|---|
| Go 1.18 | 模糊测试 |
| Go 1.21 | 自动工具链切换（`GOTOOLCHAIN=local` 关闭） |
| Go 1.24 | 模块工具依赖：`go get -tool` + `go tool` + `go.mod` 的 `tool` 指令 |
| Go 1.25 | `go doc -http` 本地文档服务器 |
| Go 1.26 | `go fix` 重建，接管 `modernize` 全部分析器 |
| 原文基线 | Go 1.27.x（本仓 `go 1.27.0`） |

## 九、容易踩的十个点

1. `go fix` 与 `gofmt -w` 都静默就地重写，先 `-diff`。
2. `go mod tidy -diff` 的**退出码**才是 CI 信号，输出只是给人看的。
3. `deadcode` 不加 `-test` 会把只被测试引用的函数误报成死代码。
4. `errcheck` 默认放过 `_ = err`，要 `-blank` 才纳入。
5. `staticcheck` 默认不是全量，首轮必须 `-checks=all`。
6. 构建缓存看不见 cgo 引入的 C 库改动，需要 `-a` 或 `go clean -cache`。
7. `-race` 构建不能当生产二进制；`-failfast` 不能跨包。
8. `-fuzz` 不接受 `./...`，且同时只允许一个匹配的模糊测试。
9. `GOTOOLCHAIN` 会按模块声明自动换用更新版本，想固定就设 `local`。
10. `go clean -modcache` 影响全机所有项目，不是只影响当前模块。

## 十、本仓现状怎么查

CI 与脚本改得比文档快，所以这里不写「当前缺什么」，只给查法：命令的输出就是现状。

```bash
# 1. 格式化与模块文件一致性有没有门禁
$ grep -rn "gofmt -l\|go mod tidy -diff\|go mod verify" .github/workflows scripts backend/Makefile

# 2. 质量工具有没有执行点
$ grep -rn "govulncheck\|staticcheck\|deadcode\|nilaway\|errcheck" .github/workflows scripts backend/Makefile

# 3. 工具版本钉没钉进模块
$ sed -n '/tool (/,/)/p' backend/go.mod
```

四类约定最容易出现「规则写了、执行点没接」，值得逐条对照：格式化（`gofmt -l .` 输出为空才算过）、
模块文件一致性（`go mod tidy -diff` 退出码 0 才算过）、漏洞面（`govulncheck` 的可达性报告）、
正确性扫描（`staticcheck`、`deadcode -test`、`nilaway`、`errcheck`）。

三处齐了才算真正接线：CI 或脚本里有执行点、`backend/go.mod` 的 `tool` 块决定版本可重现、
`.lint-baseline/` 有对应基线文件控制存量。

稳定接线的部分（仓库既定门禁，可以直接信）：

| 门禁 | 位置 |
|---|---|
| 构建、`go vet`、短测试 | [`.github/workflows/backend-gate.yml`](../.github/workflows/backend-gate.yml) |
| `go mod verify` / `go mod tidy -diff` / `gofmt -l` 空输出 | 同上 workflow + [`scripts/verify-quick.sh`](../scripts/verify-quick.sh)（GitLab `backend-gate` 同款） |
| 逐服务 `go vet` 与 `-race` 短测试 | [`.github/workflows/service-ci.yml`](../.github/workflows/service-ci.yml) |
| lint 基线棘轮（`go-vet`、`revive-exported`、`staticcheck`、`deadcode`、`vp-lint`、`knip`） | [`scripts/lint-baseline.sh`](../scripts/lint-baseline.sh) + [`.lint-baseline/`](../.lint-baseline/) |
| staticcheck / deadcode / govulncheck 的版本与调用 | [`backend/go.mod`](../backend/go.mod) 的 `tool` 段 → `make -C backend audit` |
| golangci-lint 固定版本与 SHA-256 | [`scripts/ci-install-golangci-lint.sh`](../scripts/ci-install-golangci-lint.sh) |
| `make test` = `go test -short -coverprofile=coverage.out ./...` | [`backend/Makefile`](../backend/Makefile) |

要新增一项时，成本最低的顺序是先把执行点挂上去（`go tool xxx` 或 `go run xxx@latest` 都行），
再考虑版本固定；golangci-lint 已有 SHA-256 钉死的二进制安装路径，不适用 `go get -tool` 那条建议。

## 十一、出处

- 原文：<https://www.alexedwards.net/blog/an-overview-of-go-tooling-v2>
- 译文：<https://tonybai.com/2026/11/25/an-overview-of-go-tooling-v2/>
- 初版（2019）：<https://www.alexedwards.net/blog/an-overview-of-go-tooling>
