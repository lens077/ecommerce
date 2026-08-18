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

配置中心已迁至独立仓 `../config-center`；电商仓内的 `config` 指各业务服务的配置加载层，
不再指一个本地微服务或前端应用。

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

## 反模式

- ❌ **同一条约束写两处** —— 口径会漂移。只写一处，另一处用链接指过去
- ❌ **把 docs/design/ 的内容复制进 context/** —— docs/design/ 是设计真相源，这里只做指引和补充
- ❌ **写「一次性 diff」** —— 见 [self-refinement.md](self-refinement.md) 的模式性判断
- ❌ **凭据进仓库** —— 密码/密钥只在 Consul KV 和本地环境
