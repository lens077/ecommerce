# 把部署清单全量换成 KYAML：两笔已付的学费、三处涟漪和一道门禁

日期：2026-09-18
范围：`backend/services/*/deploy/`、`frontend/apps/*/deploy/`、`application-vpa.yml`、`helm/`、`scripts/`
结论：**做了，全量转换，加阻断式门禁。** 但它防的不是「YAML 不好看」，而是一类**出错时不报错**的故障。

## 一、先说结论适用边界

KYAML 值得做的前提有两个：

1. 你的清单里存在「值的类型由解析器猜」的字段——尤其是布尔样字符串、八进制、版本号；
2. 你有一个**语义等价验证器**，能在格式变动后证明对象没变。

本仓两条都满足：第二条是 `scripts/verify-deploy-parity.sh`（helm 渲染与 kustomize 裸 manifest 必须逐字段等价）。
没有第二条的项目不要全量转换，转了也不知道有没有转坏。

## 二、为什么需要它：两笔已经付过的学费

### 学费一：`defaultMode: 0400` 在两个解析器里是两个值

挂载 Secret 时要写文件权限 `0400`。这行字面量在 YAML 1.1 与 1.2 下解析结果不同：kustomize 读成 `256`，
`yq` 读成 `400`。同一段文本，两个工具两个值。

当时的绕法是写十进制 `256`，并在模板里留一行注释解释为什么不写 `0400`：

```yaml
defaultMode: 256   # = 0400 八进制。写十进制是因为 0400 在 YAML 1.1/1.2 下解析不同(256 vs 400)
```

**KYAML 救不了这一条**——它管引号不管进制。这点必须说清楚，否则就是把 KYAML 当银弹卖。
但它说明了一件事：这个仓库已经在为 YAML 的隐式类型付维护成本，而且付的方式是「记得绕开」。

### 学费二：VPA 的 `updateMode: Off` 会变成布尔 `false`

```yaml
updatePolicy:
  updateMode: "Off"     # 引号不能省
```

省掉引号，`Off` 在 YAML 1.1 下是布尔 `false`。VPA 的 `updateMode` 期望字符串枚举，拿到布尔后行为不再是
「只生成推荐值」。本仓集群只装了 recommender，这个字段一旦失守，VPA 从「观测」变成「真去改 Pod」。

这就是经典的 [Norway Bug](https://hitchdev.com/strictyaml/why/implicit-typing-removed/) 家族：`NO` → `false`、
`on`/`off` → 布尔、`y`/`n` → 布尔。**共同特征是没有任何报错**：文件合法、`kubectl apply` 成功、语义已经变了。

### 学费三（未爆）：布尔写成字符串，`if` 恒真

这次扫描 186 个标量值时发现的。`helm/values.yaml` 里：

```yaml
consul:
  enabled: "false"          # 字符串
networkPolicy:
  enabled: true             # 布尔
```

当时的消费点只有一处，注入环境变量：

```
value: {{ $g.consul.enabled | quote }}
```

行为正确——K8s 的 env value 必须是字符串。但 Go 模板的 `if` 只看空与非空：

```
strFalse_if:  "进入了分支(危险)"    ← {{ if .Values.strFalse }} 对字符串 "false"
boolFalse_if: "跳过(正确)"          ← 同样的 if 对布尔 false
```

非空字符串 `"false"` 恒为真。只要有人日后加一句 `{{- if $g.consul.enabled }}` 做条件渲染，就会静默走错分支。
本次已改回布尔，`| quote` 对布尔 `false` 照样输出 `"false"`，env 值一字不变，parity 绿。

**注意方向**：KYAML 强制给字符串加引号，它防的是「该是字符串却被读成布尔」。这一条是反过来的
「该是布尔却写成了字符串」——KYAML 反而会把错误写法固化成合法 KYAML。工具不替代判断。

## 三、KYAML 是什么，不是什么

[KEP-5295](https://www.kubernetes.dev/resources/keps/5295/)，k8s 1.34 alpha、1.35 beta 默认开启。

**是**：YAML 的严格子集。对象 `{}`、数组 `[]`、字符串值一律双引号、保留注释与尾逗号、`---` 开头。

**不是**：新格式、新解析器、新生态。每个合法 KYAML 都是合法 YAML，`kubectl`、`kustomize`、`helm`、`yq`
全部照读。本仓实测：转换后 `kubectl apply --dry-run` 正常、`kustomize build` 正常、`helm template` 正常。

对照：

```yaml
# 块式
data:
  country: NO          # ← false
  version: 1.10        # ← 浮点 1.1
```
```yaml
# KYAML
{
  data: {
    country: "NO",
    version: "1.10",
  },
}
```

## 四、Helm 的真实情况（实测，与传闻不同）

本地 Helm **v4.2.4**：

- **没有 `-o kyaml` 输出格式。** `helm template --help` 里只有 `--output-dir`，没有输出格式开关。
  Helm 是模板引擎，模板文本原样输出，它不重新序列化你的 manifest。
- **但二进制链了 KYAML 编码器**：依赖里有 `sigs.k8s.io/yaml v1.6.0`（`kyaml` 子包就是 KEP-5295 的编码器）
  和 `sigs.k8s.io/kustomize/kyaml v0.21.1`（同名但无关，是 kustomize 的老库）。链了没暴露成 CLI 能力。
- **KYAML 作为输入全部可用**：`Chart.yaml`、`values.yaml`、`templates/*.yaml` 写成 KYAML，`helm lint` 与
  `helm template` 均正常。
- **`toJson` 输出不会被改写**：社区有报告称 Helm v4 的 kyaml 组件会把 `toJson` 结果改写成 flow-style
  YAML 从而打断下游 JSON 解码器（[rancher/fleet#5212](https://github.com/rancher/fleet/issues/5212)），
  本仓在 v4.2.4 上实测 `helm template` 与 `helm install --dry-run` 都**原样输出 JSON**。
  那个改写发生在 post-render 路径上，不用 post-renderer 就碰不到。

管道方案可用：

```bash
helm template <release> <chart> | yamlfmt -o=kyaml
```

实测对本仓 56 个对象转换后 `yq` 归一化逐字段比对完全一致，且幂等。

## 五、三个必须知道的工具陷阱

这三条不写进规范，下一个人一定会踩。

### 1. `yamlfmt` 解析失败时仍然返回 `rc=0`

```
$ yamlfmt -o=kyaml helm/templates/_ecommerce.tpl
error decoding: yaml: did not find expected node content
$ echo $?
0
```

错误只进 stderr。任何按退出码判断的脚本都会把「转换失败」当成「转换成功」，然后把空文件或原文件写回去。
**判成败只看 stderr 是否为空。** 本仓的门禁与转换脚本都这样写。

### 2. `yamlfmt` 对已含内联 flow 数组的文件不幂等

第一遍把 `resources: ["a.yaml", "b.yaml"]` 保留成单行，第二遍才展开成多行。所以转换要跑到**不动点**
（反复跑直到输出不再变），否则门禁会红在「不是规范 KYAML」上——第一次转换时正是这样被抓出 9 个文件。

### 3. 两个 formatter 会互相推翻

本仓前端用 vite-plus，`vp fmt` 也格式化 YAML。一次 `pnpm ready` 就把 `frontend/` 下 9 个部署清单
重排掉：`images: [{ … }]` 被拆行、缩进改成 8 格、多行字符串被重写。`backend/` 下同类文件毫发无损，
因为 vp 只管 frontend workspace。

更麻烦的是它的表现形式：`verify-kyaml` 红，同时 `promote-release.py` 的回写正则全部失配，而 parity 仍绿——
看起来像三个不相干的故障。修法是在 `frontend/vite.config.ts` 的 `fmt.ignorePatterns` 里排除
`**/deploy/**/*.yaml`。

## 六、一个不能转的文件：KYAML 与 `tpl` 的本质冲突

`helm/files/zero-trust.yaml` 承载 11 个 ServiceAccount 与整套 CiliumNetworkPolicy，经 Helm 的 `tpl` 二次渲染。
把它转成 KYAML 会让渲染**直接失败**：

```
Error: ... error calling tpl: cannot parse template ...
       template: gotpl:250: unexpected "\" in operand
```

原因是 KYAML 强制双引号并转义内部引号：

```yaml
# 原文
- '{{ required "global.postgresEgressCIDR is required" .Values.global.postgresEgressCIDR }}'
# 转换后
"{{ required \"global.postgresEgressCIDR is required\" .Values... }}",
```

Go 模板引擎解析到 `\"` 就报错，pre 与 prod 两条路径全红。这不是调参能绕过的。

这个文件还有第二层脆弱性：它把 Helm 控制流**藏在 YAML 注释里**，好让同一份文本既能过 `tpl`
又能被当作裸 YAML 解析：

```yaml
# {{- if .Values.global.networkPolicy.enabled }}
...
# {{- end }}
```

转换会把这对注释从文档顶层挪进对象的 `{}` 内部，即使不报错，门控范围也已经变了。

**处理方式不是「小心一点」，而是把它写进门禁的豁免清单，并让门禁断言它确实没被转换。** 一条只写在
文档里的禁令，半年后必然被某个「顺手统一一下格式」的提交推翻。

## 七、范围：36 个模板其实只有 9 种内容

一开始「36 个 Helm 模板要手工改」听起来是个大工程。按内容指纹一算：

| 指纹 | 份数 | 是什么 |
|---|---|---|
| `734fa08f…` | 10 | 各服务 `deployment.yaml`，165 B |
| `0a274501…` | 10 | 各服务 `service.yaml`，162 B |
| `4940e3e3…` | 10 | 各服务 `vpa.yaml`，158 B |
| 其余 6 份唯一 | 6 | `_ecommerce.tpl`(8 KB)、`consumer-next.yaml`、`frontend.yaml`、`certificate.yaml` 等 |

那 30 份是逐字节相同的薄包装，**里面一行 YAML 都没有**：

```
{{- if .Values.enabled }}
{{- include "ecommerce.deployment" (dict "svc" .Chart.Name ...) }}
{{- end }}
```

真正产出对象的代码全在 `helm/templates/_ecommerce.tpl`。改这**一个**文件等于改全 10 个后端服务，
连同步脚本都不需要。先估范围再动手，比按文件数吓唬自己有用。

## 八、涟漪：哪些地方按 YAML 的文本形状做了断言

这是全量转换最容易低估的成本。以下三处都不看语义只看文本，格式一变全断：

| 位置 | 依赖的形状 | 改成 |
|---|---|---|
| `scripts/promote-release.py` | `tag: 1.7.7` / `newTag: 1.7.7`（裸值） | 锚定 `键: "值",` |
| `scripts/test-promote-release.py` | 注入漂移用的 `frontend:\n` | `  frontend: {\n` |
| `backend/structcheck` 的 spread 断言 | 原文子串 `topologyKey: kubernetes.io/hostname` | 对引号容忍的正则 |

最后一条值得单独说。原写法是：

```go
fmt.Sprintf("topologyKey: %s", spread.TopologyKey)   // 字面子串
```

改成：

```go
regexp.MustCompile(regexp.QuoteMeta(key) + `:\s*"?` + regexp.QuoteMeta(value) + `"?`)
```

**理由不是「为了让 KYAML 通过」，而是这个断言要守的东西（共用模板有没有套上全仓 spread 约定）
本来就与引号无关。** 钉死在某一种写法上的断言，每次换写法都要回来改一遍，而每次改都是一次
「顺手把断言改松」的机会。让断言只约束它真正关心的维度。

顺带一提，`toYaml | nindent` 这种从 YAML 之外操纵缩进的写法在 KYAML 下可以删掉——flow 风格不靠缩进
表达结构。本仓把 `{{- toYaml ($v.resources | default $g.resources) | nindent 12 }}` 换成了逐字段展开。

## 九、负担与抉择

诚实列出代价：

- **体积涨约 80%。** helm 渲染结果从 2719 行 / 98 KB 变成 4987 行 / 140 KB。入库做 diff review 时 PR 更长。
- **多行字符串变差。** `script: |` 会变成带续行转义的引号字符串，语义不变但很难读。ConfigMap 里塞脚本、
  dashboard JSON、nginx.conf 的场景，KYAML 的收益是**负的**。
- **注释位置会变。** 格式化器把文档前的注释挪进对象 `{}` 内部。按「`---` 后第一行是某注释」解析的脚本会失效。
- **模板只能手写。** 含 Go 模板语法的文件过不了 YAML 解析器，没有 formatter 兜底，只能靠 parity 事后拦。
- **多一个工具依赖。** `yamlfmt` 要装、版本要钉（换版本会改排版，等于判据静默漂移）、CI 要装。

**为什么仍然做**：本仓两份部署真相源由 parity 逐字段强制等价，转换过程中任何语义漂移会立刻变红。
有这个验证器在，全量转换是**可验证安全**的操作，而不是一次赌博。整个迁移里 parity 跑了 6 次，
全程绿，这就是「语义没变」的全部证据——不是我说的，是命令说的。

反过来说：**没有等价门禁的项目不要学这个做法。** 可以只转 values 一类数据文件，收益（强制引号）
最大而风险最小。

## 十、给用 AI 与 harness 的项目：提示词与门禁怎么配

这一节是本次工作里最容易被忽略、但长期收益最高的部分。

### 1. 提示词写「判据 + 陷阱」，不写「请注意格式」

AI 会忘记约定，但不会忘记读 `AGENTS.md`。所以约定要写成可判定的形式，并且**把工具陷阱一起写进去**——
陷阱才是 AI 最容易踩的地方（它会理所当然地按 `rc` 判断成败）。本仓写进 `AGENTS.md` 的是：

> **部署清单一律写 KYAML**（值一律双引号、结构靠 `{}` `[]` 不靠缩进），`scripts/verify-kyaml.sh` 阻断，
> `helm/files/zero-trust.yaml` 永久豁免

细节（`yamlfmt` 的 rc=0 陷阱、不幂等、formatter 冲突、豁免理由）放在 `context/team/kyaml-manifests.md`，
由 `AGENTS.md` 一行指过去。原因很实际：`AGENTS.md` 每轮整份注入上下文，有字节预算门禁
（本仓 13000 B，这次改完剩 3 B）。**入口只放判据和指针，内容进知识库。**

### 2. 门禁必须能自己红，且红得指向病根

`scripts/verify-kyaml.sh` 分三段，对应三种失败模式：

| 段 | 查什么 | 为什么需要单独一段 |
|---|---|---|
| 静态 | 79 个文件逐字节等于 `yamlfmt -o=kyaml` 的输出 | 新增文件自动纳入（按目录 glob），不用维护清单 |
| 豁免 | `zero-trust.yaml` **确实没被**转换 | 防「顺手统一格式」推翻禁令 |
| 渲染 | `helm template` 每个对象都以 `{` 开头 | 模板源码含 Go 语法，静态查不了，只能查产物 |

它排在 parity **之前**：格式坏掉时两道都红，但 parity 只会说「哪个字段不一样」，KYAML 那条能直接
指出哪个文件写法不对。**门禁的价值不只是拦住，还要把人带到病根。**

### 3. 门禁要双向红测

只验证「正常情况下是绿的」等于没验证——那样一个 `exit 0` 也能通过。本次两个方向都测了：

- 把一个清单改回块式 → `kyaml[静态]` 红并点名该文件，恢复即绿；
- 把豁免的 `zero-trust.yaml` 转成 KYAML → `kyaml[豁免]` 与 `kyaml[渲染]` 同时红，恢复即绿。

### 4. CI 里把工具版本钉死

```yaml
- run: go install sigs.k8s.io/yaml/yamlfmt@v1.6.0
```

不要 `@latest`。formatter 换版本会改排版，而排版就是判据本身——用 `@latest` 等于让门禁的判据在
某天 CI 重跑时静默漂移，红得莫名其妙。

### 5. 记录触发它的具体事故

本仓的硬规则要求：改门禁必须在演进日志里追加一条，写清**触发它的具体事故**。理由是
「规则能从代码读出来，理由不能」。半年后有人觉得 KYAML 麻烦想改回去，日志里的
`updateMode: Off` 与 `defaultMode: 0400` 会替当时的决定说话。

## 十一、本次的验收记录

```
scripts/verify-kyaml.sh        绿（79 静态 + 1 豁免 + 渲染 56 对象中 44 KYAML、其余 12 个全部来自豁免来源）
scripts/verify-deploy-parity.sh 绿（pre 56 / prod 54 个对象逐字段等价）
python3 scripts/test-promote-release.py  绿（6 个测试）
cd backend && go test -count=1 ./structcheck/...  绿
scripts/verify-quick.sh        rc=0
scripts/verify-context.sh      绿
```

⚠️ 过程中踩到一次**假绿**，值得单独记下来：

```bash
scripts/verify-quick.sh 2>&1 | tail -25     # 退出码是 tail 的，永远 0
```

管道的退出码属于最后一个命令。当时日志里明明写着 `FAILED (errors=4)`，`echo $?` 却是 0。
判断成败必须取脚本本身的 rc，不能取管道的。

同一类问题在本次还出现过第二次：一段比对多行字符串的校验，两边 md5 都是 `d41d8cd98f00…`——
那是**空字符串的 md5**，`jq` 的路径写错了根本没取到值。如果当场报「一致」，就是一条彻头彻尾的假证据。

**这两次都不是 KYAML 的问题，是验证方法的问题。** 但它们比 KYAML 本身更值得写下来：
一道会假绿的门禁，比没有门禁更危险——没有门禁时人还知道要自己看。
