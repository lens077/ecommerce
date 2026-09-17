---
name: kyaml-manifests
layer: team
description: K8s 部署清单一律写 KYAML(YAML 的严格子集,结构靠 {} [] 而非缩进,值一律双引号);门禁是 scripts/verify-kyaml.sh。新增或修改 backend/services/*/deploy/、frontend/apps/*/deploy/、application-vpa.yml、helm/ 下任一部署清单前必读,含一份不可转换的豁免清单
affects:
  - helm
  - scripts/verify-kyaml.sh
  - scripts/promote-release.py
  - frontend/vite.config.ts
---

# K8s 部署清单写 KYAML

## 一、判定

**新增或修改任何 K8s 部署清单时,写成 KYAML,不写块式 YAML。** KYAML 是 YAML 的严格子集
([KEP-5295](https://www.kubernetes.dev/resources/keps/5295/),k8s 1.34 alpha、1.35 beta 默认开启):

- 对象用 `{}`,数组用 `[]`——结构由括号决定,不由缩进决定
- 字符串值一律双引号;键保持不带引号,除歧义时
- 保留注释与尾逗号,文档以 `---` 开头
- **它不是新格式**:每个合法 KYAML 都是合法 YAML,`kubectl`、`kustomize`、`helm`、`yq` 全部照读,不需要换解析器

判据只有一条:**这个文件会不会被 K8s 当对象吃进去**。会,就写 KYAML;是 Helm 模板体,见下面的分类表。

```bash
scripts/verify-kyaml.sh    # 三段:静态文件 / 豁免清单 / helm 渲染结果。任一红即 rc=1
```

工具(版本钉死,CI 与本地同一版;换版本会改排版,等于判据静默漂移):

```bash
go install sigs.k8s.io/yaml/yamlfmt@v1.6.0
yamlfmt -o=kyaml -d <文件>                        # 看差异
yamlfmt -o=kyaml <文件> > tmp && mv tmp <文件>     # 转换
```

## 二、为什么:两笔已经付过的学费

不是因为新格式好看。本仓被 YAML 的隐式类型转换咬过两次,伤疤还在注释里:

| 字段 | 出了什么事 | 当时的绕法 |
|---|---|---|
| `defaultMode: 0400` | kustomize 按 YAML 1.1 读成 `256`,yq 按 1.2 读成 `400`——同一段文本两个解析器两个值 | 只能写十进制 `256`,并留注释说明为什么不写 `0400` |
| VPA `updateMode: Off` | 不加引号被解析成布尔 `false`,VPA 从「只出推荐值」变成「真去改 Pod」 | 手动加引号 `"Off"` |

两次的共同点:**出错时没有任何报错**。文件合法、apply 成功、语义已经变了。KYAML 把「加引号」从
「记得手动加」变成「格式本身要求」,这两类错就不再依赖人的记性。

另一条更日常的收益:`{{- toYaml . | nindent 12 }}` 这种从 YAML 之外操纵缩进的写法可以删掉。
flow 风格不依赖缩进表达结构,改嵌套层级时不用重算空格数。

## 三、硬约束

1. **改部署清单必须保持 KYAML,门禁阻断。** `scripts/verify-kyaml.sh` 要求「与 `yamlfmt -o=kyaml`
   的输出逐字节相同」。它在 `verify-quick.sh` 里跑在 parity 之前,CI 在 `deploy-consistency.yml`
   里同序执行——格式坏掉时两道都红,但 KYAML 那条能指出哪个文件写法不对,parity 只会说哪个字段不一样。

2. **`yamlfmt` 解析失败时仍返回 `rc=0`**,只往 stderr 写 `error decoding: ...`。判断成败一律看
   stderr 是否为空,不看退出码。门禁与任何转换脚本都必须这样写,否则「转换失败」会伪装成「转换成功」。

3. **`yamlfmt` 对已含内联 flow 数组的文件不幂等。** 第一遍保留 `[a, b, c]` 单行,第二遍才展开成多行。
   转换要跑到不动点(反复跑直到输出不再变),否则门禁会红在「不是规范 KYAML」上。

4. **转换后必须跑 `scripts/verify-deploy-parity.sh`。** KYAML 只改表示不改语义,但这话要由门禁说,
   不由人说。转换脚本本身也应逐文件比对 `yq -o=json | sort_keys` 再落盘。

5. **`helm/files/zero-trust.yaml` 永久豁免,不要「顺手修一下」。** 它经 `tpl` 二次渲染。KYAML 强制双引号
   并转义内部引号,于是

   ```yaml
   - '{{ required "global.postgresEgressCIDR is required" .Values.global.postgresEgressCIDR }}'
   ```

   变成 `"{{ required \"...\" ... }}"`,Go 模板引擎解析到 `\"` 直接报
   `template: gotpl:250: unexpected "\" in operand`,pre 与 prod 两条渲染路径全红。这是 KYAML 与
   `tpl` 的本质冲突,不是调参能绕过的。该文件还把 Helm 控制流藏在 YAML 注释里
   (`# {{- if .Values.global.networkPolicy.enabled }}` … `# {{- end }}`),转换会改变注释位置,
   把它们从文档顶层挪进对象内部。门禁第二段专门断言这个文件**没有**被转换。

6. **`helm/files/otel-auth-externalsecret.yaml` 可以是 KYAML**,因为它走 `.Files.Get` 不过 `tpl`
   (原因见 [deploy-parity.md](deploy-parity.md) 硬约束 3),里面的 `{{ .k8s }}` 是给 ESO 读的,
   Helm 不会执行它,加引号也不影响 ESO 取值。

7. **`frontend/` 下的部署清单必须排除在 `vp fmt` 之外。** vite-plus 的格式化器也管 YAML,会把 KYAML
   的 `images: [{ … }]` 拆行、缩进改成 8 格、重排多行字符串。两个 formatter 会互相推翻。
   排除规则在 `frontend/vite.config.ts` 的 `fmt.ignorePatterns`(`**/deploy/**/*.yaml`)。
   `backend/` 下同类文件不受影响,因为 vp 只管 frontend workspace。

8. **按文本形状做断言的地方,改格式时要同步改。** 见下节。

## 四、按文件分类

| 范围 | 写法 | 门禁怎么查 |
|---|---|---|
| `backend/services/*/deploy/**`、`frontend/apps/*/deploy/**`、`application-vpa.yml` | KYAML | 静态:与 `yamlfmt -o=kyaml` 输出逐字节相同 |
| `helm/Chart.yaml`、`helm/values*.yaml`、`helm/charts/*/{Chart,values}.yaml` | KYAML | 同上 |
| `helm/files/otel-auth-externalsecret.yaml` | KYAML | 同上 |
| `helm/files/zero-trust.yaml` | **块式,禁止转换** | 豁免段:断言它仍是块式 |
| `helm/**/templates/*.yaml`、`helm/templates/_ecommerce.tpl` | 模板体手写成 KYAML flow 风格 | 渲染段:`helm template` 的每个对象都必须以 `{` 开头,来自豁免清单的除外 |

Helm 模板**不能**用 `yamlfmt` 转换:含 Go 模板语法的文件过不了 YAML 解析器
(`error decoding: yaml: did not find expected node content`),只能手写。好在本仓 36 份模板里
只有 9 种不同内容——各服务的 `deployment.yaml`/`service.yaml`/`vpa.yaml` 是 160 字节的薄包装
(只有一行 `include`,没有 YAML),真正的对象体集中在 `helm/templates/_ecommerce.tpl`。
改这一个文件等于改全部 10 个后端服务。

## 五、涟漪:哪些地方按 YAML 文本形状做了断言

改格式会打断这些地方,它们都不看语义只看文本:

| 位置 | 依赖什么形状 | KYAML 下改成什么 |
|---|---|---|
| `scripts/promote-release.py` | 块式裸值 `tag: 1.7.7` / `newTag: 1.7.7` | 锚定 `键: "值",`——值带双引号、行尾带逗号 |
| `scripts/test-promote-release.py` | 同上,外加注入漂移用的 `frontend:\n` | `  frontend: {\n` |
| `backend/structcheck` `TestHelmSharedTemplateUsesEcommerceNodeSpread` | 模板原文子串 `topologyKey: kubernetes.io/hostname` | 改成对引号容忍的正则 `键:\s*"?值"?`,两种写法都成立 |

最后一条是通用做法:**按文本形状断言时,让断言对引号容忍**,而不是把它钉死在某一种写法上。
钉死的断言会在下次换写法时红,而它真正要守的东西(约定有没有套上)与引号无关。

## 六、负担与取舍

采用它要付的代价,先知道再决定:

- **体积涨约 80%。** 本仓 helm 渲染结果从 2719 行 / 98 KB 变成 4987 行 / 140 KB。入库做 diff review 时 PR 更长。
- **多行字符串变差。** `script: |` 这类块标量会变成带续行转义的引号字符串,语义不变但很难读。
  ConfigMap 里塞脚本、dashboard JSON、nginx.conf 的场景,KYAML 的收益是负的。
- **注释位置会变。** `yamlfmt` 把文档前的注释挪进对象的 `{}` 内部。按「`---` 后第一行是某注释」解析的脚本会失效。
- **多一个工具依赖。** `yamlfmt` 要装、版本要钉、CI 要装。
- **模板只能手写,没有工具兜底。** 靠 parity 与 structcheck 事后拦,不靠 formatter 事前防。

值不值:本仓两份部署真相源由 parity 逐字段强制等价,任何语义漂移立刻变红——有这个验证器在,
转换是安全的。没有等价门禁的项目,全量转换的风险要重新评估,可以只转 values 一类数据文件。

## 七、验证

```bash
scripts/verify-kyaml.sh              # 格式(静态 + 豁免 + 渲染三段)
scripts/verify-deploy-parity.sh      # 语义:helm ≡ 裸 manifest,pre 与 prod 各一遍
python3 scripts/test-promote-release.py
cd backend && go test -count=1 ./structcheck/...
scripts/verify-quick.sh              # 以上都在里面
```

## 八、触发事故(2026-09-18)

用户读到 Kubernetes 推广 KYAML 的报道后,要求扫查本仓 values 里的隐式类型转换风险。扫描 186 个标量值,
经典危险裸值(`NO`/`on`/`off`/`y`/`n`/前导零/裸小数)零命中,但发现 `global.consul.enabled` 写成字符串
`"false"`,而其余所有 `enabled` 都是布尔。当时消费点只有 `{{ ... | quote }}` 注入环境变量,行为正确;
但 Go 模板的 `if` 只看空与非空,非空字符串 `"false"` 恒为真——一旦有人加条件渲染就会静默走错分支。
同时在 `_ecommerce.tpl` 里发现上面那两笔已付学费(`defaultMode` 八进制、`updateMode: Off`)。
用户据此拍板:布尔改回布尔,部署清单全量转 KYAML,并加阻断式门禁。
