---
name: git-commit
layer: team
description: Conventional Commits 规范 + 提交前必须先更新 TODO.md 的工作流
---

# Git 提交规范与工作流

## 硬规则：提交前先更新 TODO.md

每次修改代码后、执行 `git commit` **之前**，必须先更新 `TODO.md`（勾选/调整对应条目的实现进度），然后才提交。

**Why**：`TODO.md` 是本项目的进度真相源。不同步就会出现「代码已实现但文档还标 ⬜」或反过来，下一轮（尤其是新 AI 会话）会基于错误的进度做判断。

**How to apply**：
1. 完成一处代码改动
2. 编辑 `TODO.md` —— 更新「实现进度对照」表的 ✅ / 🟡 / ⬜ 状态，或勾选「近期待办」条目
3. 再 `git commit`

TODO 更新可以和代码改动放**同一个提交**，也可以紧跟一个 `docs: 更新 TODO 进度` 提交。

⚠️ 文件名是大写 `TODO.md`。git 曾误跟踪为小写 `todo.md`，已在 `b72eb7e7` 修正，不要再引入小写路径。

## 提交信息格式

遵循 **Conventional Commits**：`type(scope): subject`

- **type**：`feat` / `fix` / `perf` / `docs` / `chore`
- **scope**：模块名，常见如 `cart` / `frontend` / `product` / `address` / `api` / `order` / `gateway` / `config-center`
- **subject**：中英文混用，描述做了什么

实例（取自本仓历史）：

```
perf(cart): 优化购物车页面展示
fix(frontend): sticky AppBar, login redirect loop fix
feat(address): 完整实现地址服务
fix(gateway): make build 的 --build-arg GOIMAGE 一直是空传
feat(config-center): 打通配置下发与 cart 热更新(不经 Consul 桥接)
```

工具链：`.husky/` 已配置 husky + cz-git 做提交信息校验。

## 分支策略

项目历史**全部直接提交到 `main`**（git user: lens），不走分支 / PR 流程。

遵循这个既有习惯，**除非用户明确要求开分支**。

## 提交分组

按逻辑分组提交：**前端 / 后端 / 文档分开**，不要一次 `git add -A` 混在一起。

开始新改动前，若工作区已有未提交的改动，**先分组提交干净**再动新代码——否则新旧改动混在一个提交里，无法单独回滚。

## 相关

- 知识沉淀闭环见 [`context/harness-framework/self-refinement.md`](../harness-framework/self-refinement.md)
