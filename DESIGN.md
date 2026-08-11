---
name: 灯市 (Dengshi / Lantern Market)
description: 纸为场、竹为架、墨为字、朱砂只给要紧的动作与价格——每件商品是一盏点亮的纸灯。
colors:
  paper: "#F6EFE1"
  paper-ash: "#EDE5D4"
  paper-dim: "#EFE6D2"
  paper-lit-rest: "#FBF3DF"
  paper-lit: "#FFF7E0"
  glow: "#FFE9B8"
  ink: "#2A2A28"
  ink-soft: "#6B6357"
  bamboo: "#D8B48A"
  bamboo-deep: "#77592F"
  vermilion: "#C2372B"
  vermilion-deep: "#A82D22"
  seal-text: "#FDF8EC"
typography:
  display:
    fontFamily: "Noto Serif SC, Songti SC, SimSun, serif"
    fontSize: "2.9rem (xs) / 3.8rem (sm) / 5.2rem (md)"
    fontWeight: 900
    lineHeight: 1.12
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Noto Serif SC, Songti SC, SimSun, serif"
    fontSize: "1.7rem (xs) / 2.1rem (md)"
    fontWeight: 900
  title:
    fontFamily: "Noto Serif SC, Songti SC, SimSun, serif"
    fontSize: "1.25rem (xs) / 1.45rem (md)"
    fontWeight: 700
  body:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif (MUI 默认栈;中文回退系统字体)"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Noto Serif SC, Songti SC, SimSun, serif"
    fontSize: "1.05rem"
    fontWeight: 700
    letterSpacing: "0.12em"
  caption:
    fontFamily: "继承所在语境(次级信息不换字面)"
    fontSize: "0.85rem"
    fontWeight: 400
    note: "商家名、徽记、价格量词、页脚注等一切小字的唯一档;不再允许 0.78–0.92 之间的散值"
  price:
    fontFamily: "Noto Serif SC, Songti SC, SimSun, serif"
    fontSize: "1.3rem(卡片)/ 1.9rem(主灯)"
    fontWeight: 700
    fontVariantNumeric: "tabular-nums"
rounded:
  seal: "6px"
  card: "10px"
  card-arch: "56px 56px 8px 8px"
  hero-lamp: "120px 120px 16px 16px"
  hero-lamp-mobile: "88px 88px 14px 14px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-seal:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.seal-text}"
    typography: "{typography.label}"
    rounded: "{rounded.seal}"
    padding: "14px 30px"
  button-seal-hover:
    backgroundColor: "{colors.vermilion-deep}"
  card-lantern:
    backgroundColor: "{colors.paper-dim}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  card-lantern-lit:
    backgroundColor: "{colors.paper-lit-rest}"
  card-lantern-hover:
    backgroundColor: "{colors.paper-lit}"
  input-search:
    backgroundColor: "{colors.paper-ash}"
    textColor: "{colors.ink}"
    rounded: "8px"
  input-search-focus:
    backgroundColor: "{colors.paper-lit}"
  brand-seal:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.seal-text}"
    rounded: "{rounded.seal}"
    size: "36px"
---

# Design System: 灯市(纸灯工坊)

<!-- 本文件由 Impeccable documenter 依据已建成的代码与渲染(ground truth)记录,
     非规划文档。方向契约见 frontend/apps/consumer/index.html body 首注释
     (THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM, seed ee8c0618, form=Akari 纸灯工坊)。
     产品真相见 PRODUCT.md,本文件只管 UI 视觉。 -->

## Overview

**Creative North Star: "夜里亮着的灯市长街"**

综合商城的首页是一条夜里点亮的灯市:每件商品是一盏纸灯,光从商品**后面**发出,把纸照成暖色。整个世界只有四种材料——**纸为场、竹为架、墨为字、朱砂只给要紧的动作与价格**。它拒绝品类默认的「轮播 banner + 金刚区 + 瀑布流角标」排布:没有轮播、没有角标、没有促销贴纸,吸引力全部来自"灯被点亮"这一件事。形式语法取自 Akari 纸灯雕塑(用户亲选 challenger,seed ee8c0618):拱顶纸罩、横向竹肋、透光的纸。

验证方式是"去字测试":把所有文字拿掉,竹线横架、拱顶纸卡与一片从内透出的暖光,仍能认出这是灯市。渲染证据见 `.impeccable/shots/desktop-final.png` 与 `mobile-final.png`。

**Key Characteristics:**

- 单一暖纸场(#F6EFE1)承载一切,无白色卡片、无冷灰
- 光是从商品背后发出的(径向暖光),不是打在商品上的
- 竹金 1px 细线做全部结构分隔,从不承载文字
- 朱砂稀缺:只落在动作、价格与品牌印上
- 宋体(Noto Serif SC)三字重做全部标题与印面文字
- 唯一的 authored moment:灯阵入视后次第点亮,只放一次

## Colors

一张暖纸上的四种材料:纸的一族亮度阶(场与灯面)、墨的两级(字)、竹的两级(架)、朱砂的两级(动作),外加一个只许发光用的灯心色。

### Primary

- **朱砂 / vermilion** (#C2372B):印章红。只用于主动作按钮(seal-btn)、价格数字与 ¥ 符、品牌方印底色、链接与图标的 hover 色,以及 authored 墨线插画里的那一点红。从不做大面积装饰底、从不做信息正文色。
- **深朱砂 / vermilion-deep** (#A82D22):朱砂的按下/hover 态,仅作为 vermilion 的状态色出现。

### Neutral

- **和纸象牙 / paper** (#F6EFE1):页面底色,全站唯一的"场"。叠 SVG feTurbulence 纸纤维噪声(见 Elevation & Depth)。
- **纸灰 / paper-ash** (#EDE5D4):退后一级的纸面——Footer 底、搜索框底、插画中的垫底灰(DemoArt 的 ASH 填充)。
- **暗纸 / paper-dim** (#EFE6D2):熄灯态的灯卡底色,也是搜索框 hover 底。灯卡的"未点亮"就是这张更暗的纸。
- **常亮纸 / paper-lit-rest** (#FBF3DF):点灯动画落定后的灯卡底色(reduced-motion 下直接呈现此态)。
- **透光纸 / paper-lit** (#FFF7E0):最亮的纸——灯卡 hover/focus-within 态、主灯常明底色、搜索框 focus 底。
- **灯心光 / glow** (#FFE9B8):只允许出现在 inset box-shadow 的发光值里(rgba(255,233,184,…) / rgba(255,227,160,…)),永不做填充底色或文字色。
- **炭墨 / ink** (#2A2A28):主文本、墨线插画笔画、focus outline。
- **暖墨 / ink-soft** (#6B6357):次要文本(商家名、副句、说明)。在 paper #F6EFE1 上 ≥4.5:1。
- **竹金 / bamboo** (#D8B48A):结构线专用——1px 边框、分隔线、竹肋。**仅装饰,不承载文字**(在纸面上对比不足)。
- **深竹 / bamboo-deep** (#77592F):文字安全的竹色——hover 边框、小标("演示商品"标注)。对比度口径:在 paper #F6EFE1 纸面上实测 ≥4.5:1;所有对比度声明均以 #F6EFE1 为底测量。
- **印面白 / seal-text** (#FDF8EC):朱砂底上的文字与白描线(seal-btn 文字、BrandMark 线稿、印章徽记文字)。

### Named Rules

**朱砂惜墨规则。** 朱砂只给要紧的东西:动作(按钮、hover)、价格、品牌印,以及 authored 插画里的单点红。一屏之内朱砂面积越小,点下去越像盖章。不得用朱砂做装饰底、标签雨或正文强调。

**竹不承字规则。** 竹金 #D8B48A 只画线、只描肋、只做边框,永不写字;需要"竹色的字"时一律用深竹 #77592F(对比度以 #F6EFE1 为底实测 ≥4.5:1)。

**光只从 inset 来规则。** 灯心光 #FFE9B8 一族只能以 inset box-shadow 的形式存在——光在纸里面,不在纸外面。

## Typography

**Display Font:** Noto Serif SC(回退 "Songti SC", "SimSun", serif)——经 @fontsource 自托管,只引入 400/700/900 三字重,按 unicode-range 切片,浏览器只拉用到的字形片(`main.tsx` 顶部三行 import)。
**Body Font:** MUI 默认栈(Roboto, Helvetica, Arial, sans-serif;中文回退系统字体)。
**价格数字:** 与 Display 同宋体,700,`font-variant-numeric: tabular-nums`。

**Character:** 宋体承担一切"墨写的"东西——大标、节题、商品名、印面、价格;正文与操作性小字交给系统栈。字重分工严格:900 是喊出来的(H1「灯市开了。」、节题、品牌名),700 是印上去的(按钮、价格、商品标题、Footer 栏题),400 只在宋体正文兜底。

### Hierarchy

- **Display** (900, 2.9rem→3.8rem→5.2rem 响应式, line-height 1.12, letter-spacing 0.02em):首屏大标「灯市开了。」专用,一页一次。
- **Headline** (900, 1.7rem→2.1rem):节题(「今日亮灯」)与 AppBar/Footer 品牌名(品牌名加 letter-spacing 0.06em)。
- **Title** (700, 1.25rem→1.45rem):主灯位商品名;灯卡商品名降为 600/0.95rem/两行截断(line clamp 2, min-height 2.85em)。
- **Body** (400, 0.95rem–1.1rem, line-height 1.5–1.9):副句 line-height 1.9、max-width 34em;卡内商家名 0.8rem ink-soft。
- **Label** (宋体 700, 0.95rem–1.05rem, letter-spacing 0.12em–0.18em):按钮与印面文字;印章徽记 0.78rem/0.18em 且 `writing-mode: vertical-rl` 竖排。

### Named Rules

**价格墨字规则(PriceInk)。** 价格是排印,不是标签:¥ 符缩至 0.85em、朱砂色;数字宋体 700、朱砂、tabular-nums(md 1.3rem / lg 1.9rem);「起」后缀 0.82rem 暖墨。三段一行,`white-space: nowrap`。全站价格一律走此语法。

**竖排只给印章规则。** `writing-mode: vertical-rl` 仅用于朱砂印章徽记(「本日主灯」),不用于正文或导航。

## Layout

- **容器:** MUI `Container maxWidth="lg"`(1200px),页面上下留白 pt 32–48px / pb 48px。
- **首屏:** 桌面左右分栏 flex——左 55% 墨字大标 + 副句 + 朱砂 CTA,右 45% 主灯位;列间 gap 40px;移动端上下堆叠(gap 32px)。首屏与下一节之间留 40–64px。
- **类目竹架:** 上下各一条 1px 竹线夹出的横条(py 16px),8 个类目;桌面 `space-between` 铺满,移动端横向滚动且隐藏滚动条(`scrollbarWidth: none`)。
- **灯阵:** CSS Grid,2 列(xs)→3 列(sm)→4 列(md),gap 12px(xs)/16px(md)。卡片等高(`height: 100%`,价格 `margin-top: auto` 沉底)。
- **间距节奏:** 4px 基数刻度(4/8/12/16/20/24/32/40/48/64),经 `sp` 常量以像素字符串喂给 MUI sx(绕开 MUI 8px 系数换算,见 tokens.ts 注释)。
- **锚点滚动:** 「进灯市」CTA 平滑滚动到 `#lantern-grid`,其 `scroll-margin-top: 88px` 为 sticky AppBar 让位。

## Elevation & Depth

本系统不用常规"抬升阴影"表达层级——**深度就是光**。灯亮的表面获得 inset 暖光(光在纸里),外阴影极少且必须是暖棕色调、只作为"灯下的一点落影"与内光成对出现。冷灰/纯黑投影不存在于世界内(唯一例外见下)。

材质由两层 SVG 噪声承担(feTurbulence fractalNoise 的 data-uri,零网络依赖):

- **页底噪声**(`.lantern-page`):240px 平铺,baseFrequency 0.85,alpha 0.05,冷调压暗。
- **灯面噪声**(`.lantern-card` / `.lantern-hero-lamp`):180px 平铺,baseFrequency 0.9,alpha 0.045,暖棕矩阵——**纸纹理必须落在灯体上**,不只铺在页底。

### Shadow Vocabulary

- **灯卡常亮** (`inset 0 0 46px rgba(255,227,160,0.9), 0 12px 30px -18px rgba(138,106,66,0.5)`):点灯动画的终态。
- **灯卡透光(hover/focus-within)** (`inset 0 0 56px rgba(255,227,160,1), 0 14px 34px -16px rgba(138,106,66,0.55)`):更亮的内光 + 略深的暖落影。
- **主灯呼吸** (`inset 0 0 60px→88px rgba(255,233,184,0.85→1)`):5.5s ease-in-out 无限循环,唯一的常驻动画。
- **印面内沿** (`inset 0 0 0 1px rgba(253,248,236,0.4)`):所有朱砂印(按钮、方印、徽记)的 1px 印面白内描边。
- **浮层墨影** (`0 14px 40px -18px rgba(42,42,40,0.35)`):唯一的炭墨色外阴影,仅用于搜索结果浮层这类脱离纸面的 overlay。

### Named Rules

**光即层级规则。** 表面的重要性用"亮到什么程度"表达,不用"浮到多高"表达:熄灯纸 #EFE6D2 → 常亮 #FBF3DF → 透光 #FFF7E0,内光随之增强。禁止给纸面内元素加冷色 drop shadow。

**纹在灯上规则。** 噪声纹理是灯纸的材质而非页面的壁纸:任何"灯"性质的表面(灯卡、主灯)必须自带灯面噪声层。

## Shapes

灯笼的几何:**拱顶 + 直角脚**。圆全部朝上,底部收小圆角——这是世界的招牌轮廓。

- **灯卡外框:** 10px 圆角,1px 竹线边框。
- **灯卡图区(灯身):** `border-radius: 56px 56px 8px 8px` 拱顶,1:1 方比,1px 半透明竹线(rgba(216,180,138,0.55))。
- **主灯:** `120px 120px 16px 16px`(移动端 `88px 88px 14px 14px`)的大拱顶灯形,1px 竹线,hover 转深竹。
- **印章:** 6px 小圆角方章(按钮、品牌印、徽记),带印面白内描边。
- **竹肋两种形态:** 灯卡上是**直线**——`repeating-linear-gradient(180deg, transparent 0 34px, rgba(181,138,84,0.16) 34px 35px)` 每 34px 一根;主灯上是**弯曲 SVG**——5 条 `Q` 曲线 path(stroke 竹金 1.4,整组 opacity 0.55),随灯形起拱(Akari 的招牌几何)。
- **线语法:** 结构一律 1px:实竹线 `1px solid #D8B48A`(tokens 的 `line`)与软竹线 `1px solid #E5D7BE`(`lineSoft`,用于弱分隔如演示说明上边线)。

## Components

### 纸灯商品卡(LanternCard)— 签名组件

一盏灯的解剖,构成三件套缺一不可:**径向暖光(光从商品后面发出)+ 拱顶 + 竹肋**。

- **外框:** paper-dim 底 + 灯面噪声,1px 竹线,10px 圆角,整卡是 `<Link>` 一步进详情。
- **灯身(图区):** 1:1,拱顶 56px;背景 = 直线竹肋叠加径向光 `radial-gradient(ellipse 72% 60% at 50% 42%, #FFF6DC 0%, #F5EBD2 62%, #EDE3CA 100%)`——光心在商品身后偏上,商品的墨线插画浮在光前。
- **文字区:** 商品名 600/0.95rem 两行截断 → 商家名 0.8rem 暖墨 → PriceInk 沉底。
- **状态:** 熄灯(#EFE6D2)→ 点亮动画 → 常亮(#FBF3DF + 内光)→ hover/focus-within 透光(#FFF7E0 + 满强内光 + 深竹边框)。过渡 180ms ease-out。
- **点灯动画(唯一的 authored moment):** `lantern-light-up` 700ms `cubic-bezier(0.16,1,0.3,1)`,从暗纸 + translateY(6px) 到常亮 + 内光;各卡按 `--i` 索引以 70ms 步进次第点亮。**必须入视触发**:IntersectionObserver(rootMargin 底部 -12%)看到灯阵才加 `.lantern-grid-lit`,触发一次即断开;不支持 IO 时直接点亮,永不隐形。`prefers-reduced-motion: reduce` 下不播动画,直接呈现常亮终态。

### 主灯位(Hero Lamp)— 签名组件

首屏右 45% 的灯笼形大灯:paper-lit 底 + 灯面噪声,大拱顶(120px),弯曲 SVG 竹肋满铺,呼吸光 5.5s 常明(reduced-motion 下静止在 60px 内光)。右上角竖排朱砂印章徽记「本日主灯」;内容为商品插画(168–216px)+ 商品名(Title)+ 商家 + PriceInk(lg)+ 「看灯去」印章按钮。整体为 `<Link>`,hover 边框转深竹。

### 朱砂印按钮(.seal-btn)

- **形:** 6px 方章,无 border,印面白 1px 内描边。
- **色:** vermilion 底 + seal-text 字;宋体 700,letter-spacing 0.12em–0.14em;主 CTA padding 14px 30px,次级 10px 22px。
- **状态:** hover 转 vermilion-deep(140ms ease-out);active `scale(0.97)`(盖章手感);focus-visible 炭墨 2px outline、offset 2px。

### 价格排印(PriceInk)

见 Typography 的价格墨字规则。md(卡内)数字 1.3rem,lg(主灯)1.9rem。

### 类目竹架(Category Rack)

两条竹线夹住的 `<nav>`(带 aria-label);每项 = 墨线图标(24 viewBox,stroke 1.6,round cap/join,`currentColor`)+ 宋体 600/0.92rem 类目名,纵向居中排列;默认炭墨,hover 整项转朱砂(140ms)。

### 品牌方印(BrandMark)

Authored 章面,替代 stock 图标:朱砂 6px 方章(AppBar 36px / Footer 40px,印面白内描边)内嵌 24 viewBox 白描纸灯线稿(提梁 + 拱顶纸罩 + 两根竹肋 + 底座与穗,stroke 1.8/1.2,`currentColor` 取印面白)。旁跟宋体 900 品牌名「灯市」(letter-spacing 0.06em)。

### 墨线插画语法(ProductArt / CategoryIcon)— 演示资产

商品图语法:炭墨线稿(stroke 2,round cap/join)+ 纸灰 #EDE5D4 垫面 + 一点竹金细节(stroke 1.6)+ **单点朱砂**(每张至多一处红:指示灯、烛火、一道红线)。96 viewBox,带 `role="img"` 与 aria-label。类目图标同语法,stroke 1.6、`currentColor`。真实商品图接通后此套插画退役为兜底占位。

### AppBar(全站 chrome 皮肤)

- **底:** `rgba(246,239,225,0.92)` + `backdrop-filter: blur(10px)`,无阴影,1px 竹线下边框,sticky。
- **搜索框:** paper-ash 底、竹线边框、8px 圆角;hover 转 paper-dim + 深竹线;focus-within 转 paper-lit + 朱砂边框 + `0 0 0 3px rgba(194,55,43,0.14)` 朱砂焦环。
- **搜索结果浮层:** paper 0.96 + blur、竹线边框、浮层墨影;结果卡 #F9F3E6 底竹线框,hover 透光(#FFF7E0 + 30px 内光 + translateY(-2px)),价格走宋体 tabular 朱砂。
- **动作:** 图标 hover 得 `rgba(194,55,43,0.08)` 朱砂晕底;登录按钮为印章语法(朱砂底 + 内描边 + deep hover)。

### Footer

paper-ash 底 + 1px 竹线上边框;品牌区复用 BrandMark(40px)+ 宋体 900 品牌名;四栏 grid(xs 1 / sm 2 / md 4),栏题宋体 700 炭墨;链接次级色,hover 转朱砂 + 下划线;分隔线为竹金 1px(opacity 0.6)。

## Do's and Don'ts

### Do:

- **Do** 让每盏灯带齐构成三件套:径向暖光(光从商品**后面**发出)、拱顶、竹肋。少一件就不是灯,是卡片。
- **Do** 把纸噪声落在灯体上(卡与主灯自带 180px 噪声层),页底噪声(240px)只是场。
- **Do** 用入视触发点灯:动画只在灯阵进入视口后播一次;IO 不可用直接点亮;reduced-motion 直接给终态。
- **Do** 价格一律走 PriceInk 语法:小 ¥ + 宋体 700 tabular 数字 + 暖墨「起」,全部一行不折。
- **Do** 微交互统一 140–180ms ease-out;唯一的常驻动画是主灯 5.5s 呼吸。
- **Do** 所有朱砂印带 1px 印面白内描边(`inset 0 0 0 1px rgba(253,248,236,0.4)`),focus-visible 用炭墨 2px outline。
- **Do** 对比度以 paper #F6EFE1 为底口径实测:正文用 ink,次级用 ink-soft,竹色文字只用 bamboo-deep。

### Don't:

- **Don't** 用竹金 #D8B48A 写字——它只许画线(竹不承字规则)。
- **Don't** 把朱砂铺成面:不做装饰底、促销角标、标签雨;朱砂之外的强调靠"更亮的纸"(朱砂惜墨规则)。
- **Don't** 给纸面内元素加冷灰/纯黑 drop shadow;发光一律 inset,炭墨外影只属于脱离纸面的浮层(光即层级规则)。
- **Don't** 引入轮播 banner、金刚区色块、瀑布流角标——世界的成立就建立在拒绝这套品类默认上。
- **Don't** 让点灯动画在折叠线下无人看见时空放,也不许滚动反复重播:一次入视,一次点亮。
- **Don't** 虚构销量、评分、媒体背书;演示数据必须可辨识为演示(见附录·演示数据纪律)。
- **Don't** 在 merchant/admin 使用发光戏法(见附录·模式延伸)。

---

## 附录(灯市专属,非 DESIGN.md 规范节)

### 模式延伸:三端如何共用一个世界

方向契约声明的跨端规则(PRODUCT.md 原则 2 的视觉落地):

- **consumer = Persuade,全语法**:上文全部——发光、点灯、呼吸、印章、插画一应俱全。
- **merchant / admin = Operate,收敛版**:同一材料表,去掉全部发光戏法。纸面(paper/paper-ash)做底、墨字(ink/ink-soft)做数据、竹线(bamboo 1px)做表格与分隔、朱砂仍只给关键动作与危险确认;**无 inset 灯光、无点灯动画、无呼吸**。数据密度优先,宋体只留给页面标题一级。
- **desktop(Tauri 壳)**:跟随 merchant 的 Operate 收敛版,不做平台原生化(PRODUCT.md 约束)。

### 演示数据纪律

首页当前渲染 authored 演示数据(`components/home/demoProducts.ts`),纪律为:界面上明示「演示商品」小标(bamboo-deep)+ 灯阵底部整句说明;商品与商家均虚构且命名风格统一;**不含虚构销量/评分/背书**(PRODUCT.md「Evidence on Hand」的硬约束);ListProduct 接通后删除该文件换 useQuery,空态/骨架沿用灯卡的熄灯态。

### 迁移清单(尚在旧世界的部位)

以下部位仍使用旧极简系统(tokens.ts 的 `tokens` 段:#f9fafb 灰白底/纯白卡/#ef4444 红)或 MUI 默认样式,按此清单逐个迁入灯市:

1. **PrivacyConsent 隐私弹窗**:白底 + MUI 蓝色按钮,渲染截图中即可见,与世界冲突最刺眼,优先迁移(纸底 + 印章按钮语法)。
2. **consumer 其余 routes**:product 详情、categories、cart、checkout、orders、payment、profile、addresses、notFound——均未接入 `lantern` 令牌。
3. **AppBar 存量细节**:功能图标仍是 MUI stock(Search/Cart/Account/MoreVert),尚无 authored 替代;搜索框 20ch 宽度过渡动画为既有低优先项。
4. **merchant / admin / desktop app**:整端未动,迁移时按上文 Operate 收敛版执行。

迁移期间 `tokens` 段保留供旧页面使用;新写或改造的 surface 一律取 `lantern` 段,不得混用两套色。

### 与 docs/design/ 的分工

本文件是**UI 视觉**的唯一真相源(色/字/形/动效/组件语法)。`docs/design/` 按微服务存放**架构设计**(服务边界、契约、数据流),两者互不覆盖;拓扑真相在 `.service-matrix.yaml`,进度真相在 `TODO.md`,产品真相在 `PRODUCT.md`。
