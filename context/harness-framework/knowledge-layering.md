---
name: knowledge-layering
layer: harness-framework
description: 一条知识该写进 team / harness-framework / project 哪一层的判定规则
---

# 知识分层规则

## 三层

| 层 | 路径 | 判据 | 更新频率 |
|---|---|---|---|
| 团队级 | `context/team/` | **换个模块、换个服务，它依然成立** | 最低 |
| 框架工程级 | `context/harness-framework/` | 约束的是 **AI 协作机制本身**，不是业务 | 中 |
| 服务级 | `context/project/ecommerce/{module}/` | 只对**某一个模块**成立 | 最高、量最大 |

## 判定流程

```
新知识
  │
  ├─ 它约束的是「知识怎么组织 / 错误怎么沉淀」？
  │     └─ 是 → context/harness-framework/
  │
  ├─ 换个服务它还成立吗？
  │     ├─ 成立 → context/team/
  │     └─ 不成立 → context/project/ecommerce/{module}/
  │                   ├─ 是踩过的坑 / 事故复盘 → experience/
  │                   ├─ 是稳定的架构说明     → architecture.md
  │                   └─ 是可重复的操作步骤   → sop/
  │
  └─ 它是一次性的调试细节吗？（某次的临时端口、某个已删分支）
        └─ 是 → 不要写。这类内容会污染知识库
```

## 服务级目录约定

```
context/project/ecommerce/{module}/
├── INDEX.md            该模块的入口，列出下面有什么
├── architecture.md     架构与关键设计（可选，别和 docs/design/ 重复）
├── experience/         踩坑记录，一坑一文件
│   └── {kebab-case-slug}.md
└── sop/                标准操作规程（可选）
```

`{module}` 用**代码目录名**，不是中文名也不是服务的 proto package 名：

| module | 代码路径 |
|---|---|
| `gateway` | `gateway/` |
| `cart` / `order` / `product` / `behavior` … | `backend/services/{module}/` |
| `consumer` / `merchant` / `admin` | `frontend/apps/{module}/` |

Config Center 由 sibling 仓 control-tower 提供（SDK 为
`github.com/lens077/control-tower/sdk/configsource`，`backend/go.mod` 已钉）；
电商仓内的 `config` 指各业务服务的配置加载层，不再指一个本地微服务或前端应用。

## experience 文件的写法

一个坑一个文件，文件名是 kebab-case 的**症状**（不是原因），因为下次遇到时你先看到的是症状。

必须包含四段：

```markdown
**症状**：能观察到的现象，越具体越好（日志原文、报错文本、界面表现）
**关键陷阱**：为什么容易误判 —— 这段最值钱
**根因**：真正的原因
**修复**：改了哪个文件的什么
```

有「关键陷阱」这一段是本项目 experience 的硬要求。踩坑之所以是坑，往往不是因为难，
而是因为**第一直觉会指向错误的方向**（例：JWT 那条，用 curl 复现会误判为"没问题"）。
不写下这个陷阱，下次还会沿同一条错误路径浪费时间。

「症状」与「关键陷阱」两段由 `scripts/verify-context.sh` 机械强制（`**X**` 或 `## X`
标题任一形式均可，允许 `**关键陷阱：具体标题**` 带副标题）；不是坑体裁的存量文件
冻结在 `scripts/context-format-baseline.txt`，新文件必须合规。

## frontmatter 与 `affects:` 反向索引

每个非 INDEX 文件都有 frontmatter：`name`（= 文件名）、`description` 必填，`layer` / `module`
可选但写了必须与路径一致（`[FRONTMATTER]` 门禁）。

`affects:` 是可选的**反向依赖索引**：列出「实现或受本文约束」的代码路径。
runbook §0.1 解决的是正向问题——动某类代码前读哪份文档；`affects:` 解决反向问题——
**改了这份文档的约束后，要回头核对哪些实现**。没有它，规范改了、两周前按旧规范写的代码没人回头看，
文档与实现就静默跑偏（典型：错误格式后来加了 `trace_id`，早期接口没跟）。

```yaml
---
name: proto-design
layer: team
description: …
affects:
  - backend/api
  - backend/structcheck/rpc_method_test.go
---
```

规则：

- 值是仓库相对路径，**文件或目录皆可，不支持 glob**；目录表示「其下全部」。
- 每个路径必须真实存在，`scripts/verify-context.sh` 的 `[AFFECTS]` 检查兜底——索引一旦指向已删路径就是错的索引，比没有更糟。
- 只登记**确定**的实现点。宁少勿滥：一份文档挂十几个泛目录（`backend/services`）等于没挂。
- 登记时机是写规则 / experience 时顺手写；**不要为了「补全」一次性扫全仓**——那是形式主义，且会写出大量泛路径。
- `docs/design/` 下的文件若带 frontmatter，同样可用 `affects:`。

查询工具：`scripts/spec-impact.sh [git-diff 范围]`。它按改动文件双向查——改了文档 → 列出受影响路径并给出
对应的验证命令；改了代码 → 列出声明依赖它的文档，提醒回写。默认比对工作树+暂存区相对 `HEAD`。

## 反模式

- ❌ **同一条约束写两处** —— 口径会漂移。只写一处，另一处用链接指过去
- ❌ **把 docs/design/ 的内容复制进 context/** —— docs/design/ 是设计真相源，这里只做指引和补充
- ❌ **写「一次性 diff」** —— 见 [self-refinement.md](self-refinement.md) 的模式性判断
- ❌ **凭据进仓库** —— 密码/密钥只在 Config Center 和本地环境（K8s 里经 Secret 挂载）
