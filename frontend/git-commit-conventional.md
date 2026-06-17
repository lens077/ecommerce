
---
name: git-commit-conventional
description: |
  遵循 Angular 约定式提交规范（Conventional Commits）生成或优化 Git commit message。
  当用户需要编写提交信息、生成 changelog、或在 git commit 前校验格式时，应使用此 skill。
---

# Git Commit 规范 (Angular 风格)

## 规范概述

使用约定式提交 (Conventional Commits) 标准，格式如下：
<type>(<scope>): <subject>
<BLANK LINE>

<body> <BLANK LINE> <footer> ```
1. Header（必填）
<type> - 提交类型（必填）
类型	说明	示例
feat	✨ 新功能	feat: 添加用户登录功能
fix	🐛 修复 Bug	fix: 修复 token 过期后无法自动刷新的问题
docs	📝 文档更新	docs: 更新 README 中的安装说明
style	💎 代码格式（不影响运行）	style: 调整缩进为 2 空格
refactor	♻️ 重构代码	refactor: 将请求拦截器抽离为独立模块
perf	⚡️ 性能优化	perf: 优化首页列表虚拟滚动
test	✅ 测试相关	test: 补充用户服务单元测试
build	🏗️ 构建系统或外部依赖	build: 升级 vite 至 6.0
ci	🔧 CI 配置变更	ci: 添加 pnpm 缓存到 GitHub Actions
chore	🧹 杂项（工具、配置文件）	chore: 更新 .gitignore
revert	⏪️ 回退之前的提交	revert: feat: 添加用户登录功能
<scope> - 影响范围（可选）
描述本次提交影响的模块、组件或功能区域，例如：

auth（认证模块）

ui（UI 组件库）

api（接口层）

deps（依赖管理）

config（配置文件）

<subject> - 简短描述（必填）
使用命令式语气，如“添加”而非“添加了”

首字母小写

结尾不加句号

长度控制在 50 字符以内

✅ 正确示例：

text
feat(auth): 添加微信快捷登录功能
fix(cart): 修复结算页金额计算错误
❌ 错误示例：

text
feat: 添加了微信快捷登录功能。   (结尾有句号且使用了“添加了”)
Fix(Cart): 修复结算页金额计算错误 (首字母大写，scope 随意大写)
2. Body - 详细描述（可选）
解释 为什么 修改以及 如何 修改

说明与之前行为的差异

每行不超过 72 字符

示例：

text
fix(cart): 修复结算页金额计算错误

由于未考虑运费优惠券的互斥逻辑，当用户同时使用满减券和免运费券时，
总金额计算错误。本次修改增加了优惠券类型的优先级判断。

Closes #245
3. Footer - 备注（可选）
BREAKING CHANGE: 描述不兼容变更，全大写。

Closes #issue 关闭关联的 Issue，可多个。

示例：

text
feat(api): 将用户接口从 REST 迁移至 GraphQL

BREAKING CHANGE: 旧版 REST 接口 /api/user 已移除，请使用 GraphQL 查询。
Closes #123, #124
完整示例
text
feat(auth): 支持手机号一键登录

实现运营商网关取号能力，无需短信验证码即可登录。
增加了 getPhoneNumber 接口调用和降级处理逻辑。

Closes #456
工具集成建议
生成规范提交：使用 commitizen 交互式生成。

bash
npx cz
校验提交格式：使用 commitlint + husky。

bash
npm install -D @commitlint/config-conventional @commitlint/cli husky
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit "$1"'
自动生成 CHANGELOG：使用 standard-version。

bash
npm run release   # 自动更新版本号、生成 changelog 并打 tag
指令
当用户要求编写 commit message、优化 git 提交、生成符合规范的提交信息时：

确认用户意图（新功能、修复、文档等）。

询问是否有关联的 scope 和 issue 编号。

按照上述格式生成 commit message，并提醒用户 body 和 footer 为可选。

如用户提供的是不符合规范的消息，主动将其转换为规范格式。
