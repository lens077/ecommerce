# 项目使用到的Skills
/Users/sumery/lens077/ecommerce/ai-helper.sh

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
