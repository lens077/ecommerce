# 项目使用到的Skills
/Users/sumery/lens077/ecommerce/ai-helper.sh

# impeccable
仓库：https://github.com/pbakaus/impeccable
示例：
```shell
所有命令均通过 /impeccable 访问：

Command  指挥	What it does  它的作用
/impeccable craft	Full shape-then-build flow with visual iteration
完整成型再构建流程，配合视觉迭代
/impeccable init	One-time setup: gather design context, write PRODUCT.md and DESIGN.md, configure live mode, recommend next steps
一次性设置：收集设计背景，编写 PRODUCT.md 和 DESIGN.md，配置实时模式，建议下一步
/impeccable document	Generate root DESIGN.md from existing project code
从现有项目代码生成根 DESIGN.md
/impeccable extract	Pull reusable components and tokens into the design system
将可重复使用的组件和代币导入设计系统
/impeccable shape	Plan UX/UI before writing code
在写代码前先规划好用户体验/界面
/impeccable critique	UX design review: hierarchy, clarity, emotional resonance
用户体验设计评测：层级结构、清晰度、情感共鸣
/impeccable audit	Run technical quality checks (a11y, performance, responsive)
进行技术质量检查（A11y、性能、响应式）
/impeccable polish	Final pass, design system alignment, and shipping readiness
最终检查、设计系统对齐及出轨准备
/impeccable bolder	Amplify boring designs  放大镗床设计
/impeccable quieter	Tone down overly bold designs
降低过于夸张的设计
/impeccable distill	Strip to essence  从条纹到精华
/impeccable harden	Error handling, i18n, text overflow, edge cases
错误处理、i18n、文本溢出、边缘情况
/impeccable onboard	First-run flows, empty states, activation paths
首运行流、空态、激活路径
/impeccable animate	Add purposeful motion  增加有目的的动作
/impeccable colorize	Introduce strategic color
引入战略色彩
/impeccable typeset	Fix font choices, hierarchy, sizing
修正字体选择、层级和大小
/impeccable layout	Fix layout, spacing, visual rhythm
修正布局、间距、视觉节奏
/impeccable delight	Add moments of joy  增添快乐的时刻
/impeccable overdrive	Add technically extraordinary effects
加入技术上非凡的特效
/impeccable clarify	Improve unclear UX copy  改进不清晰的用户体验文案
/impeccable adapt	Adapt for different devices
适配不同设备
/impeccable optimize	Performance improvements  性能改进
/impeccable live	Visual variant mode: iterate on elements in the browser
可视化变体模式：在浏览器中迭代元素
```

# Agent-Reach
仓库：https://github.com/Panniantong/Agent-Reach
示例：
```shell
帮我搜索 XXX
```
## hcom
编码代理用它在终端间互相发送消息、监视和生成信息

仓库：https://github.com/aannoo/hcom
示例：
```shell
hcom claude
hcom codex
```

## archify
图表制作

仓库：https://github.com/tt-a1i/archify/blob/main/README_ZH.md
安装：
```shell
npx skills add tt-a1i/archify -g
```

示例：
```shell
/archify
阅读https://github.com/tt-a1i/archify/blob/main/README_ZH.md获取完整的指南

我需要做一个类似思维导图，从左到右，按照/Users/sumery/lens077/ecommerce项目的README设计为最终最终目标来设定最终主线任务，每次我向你提问时，你需要根据提问的问题来分类，例如我从第一个问题开始问，你就创一个包含问题矩形摘要，如果这个问题是和主线相关联就连成一条线，没有关联则分叉作为支线，把我项目当前的TODO进行整理，

绘画出图,选择合适的图表
```

# tech-doc-style-chinese
面向中文技术文档、产品文案与界面文案的写作 Skill。
仓库地址：https://github.com/Fenng/Tech-Doc-Style-Chinese

## 使用场景
文档首页、落地页、首屏文案
接口文档、参数说明、错误码说明、更新日志
产品能力介绍、解决方案页、能力说明页
界面文案、按钮文案、导航标签、提示信息
不适合以下内容：

代码字面量
JSON 键名
URL
API 路径
数据库字段名
其他机器可读标识符

```shell
npx skills add https://github.com/Fenng/tech-doc-style-chinese
```
