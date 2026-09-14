/**
 * 首页演示商品数据(synthetic,界面已标注「演示商品」)
 *
 * ListProduct 尚未接通(见 routes/index.tsx 的 TODO):在真实数据到来之前,
 * 首页用这份 authored 数据立住「灯市」视觉世界。商品与商家均为虚构,
 * 不含虚构销量/评分/背书;价格单位:元。
 * 接通后:删除本文件,替换为 useQuery(ListProduct) 的分页数据。
 */

import type { ArtKind, CategoryKind } from "./DemoArt";

export interface DemoProduct {
  spuId: string;
  spuCode: string;
  name: string;
  /** 最低 SKU 售价,单位元 */
  minPrice: number;
  /** 发行方(商家) */
  merchant: string;
  art: ArtKind;
}

export interface DemoCategory {
  key: string;
  name: string;
  icon: CategoryKind;
}

/** 首屏「主灯」位 — 本日主推 */
export const heroProduct: DemoProduct = {
  spuId: "demo-hero",
  spuCode: "DEMO-HUMIDIFIER",
  name: "山雾 · 超声波加湿器",
  minPrice: 199,
  merchant: "云雾电器",
  art: "humidifier",
};

export const demoProducts: DemoProduct[] = [
  {
    spuId: "d01",
    spuCode: "DEMO-EARBUDS",
    name: "月轮 真无线蓝牙耳机",
    minPrice: 349,
    merchant: "声原电子",
    art: "earbuds",
  },
  {
    spuId: "d02",
    spuCode: "DEMO-SHOE",
    name: "素帆 硫化帆布鞋",
    minPrice: 168,
    merchant: "山茶服饰",
    art: "canvasShoe",
  },
  {
    spuId: "d03",
    spuCode: "DEMO-THERMOS",
    name: "暖泉 保温杯 500ml",
    minPrice: 89,
    merchant: "铁瓷生活",
    art: "thermos",
  },
  {
    spuId: "d04",
    spuCode: "DEMO-LAMP",
    name: "纸月 折叠台灯",
    minPrice: 129,
    merchant: "竹里灯具",
    art: "deskLamp",
  },
  {
    spuId: "d05",
    spuCode: "DEMO-PAN",
    name: "本手 雪平锅 18cm",
    minPrice: 76,
    merchant: "一釜厨具",
    art: "pan",
  },
  {
    spuId: "d06",
    spuCode: "DEMO-SCARF",
    name: "云杉 羊毛围巾",
    minPrice: 215,
    merchant: "山茶服饰",
    art: "scarf",
  },
  {
    spuId: "d07",
    spuCode: "DEMO-KEYBOARD",
    name: "青轴 机械键盘 87 键",
    minPrice: 399,
    merchant: "声原电子",
    art: "keyboard",
  },
  {
    spuId: "d08",
    spuCode: "DEMO-PLANT",
    name: "苔庭 桌面绿植盆栽",
    minPrice: 45,
    merchant: "花市园艺",
    art: "plant",
  },
  {
    spuId: "d09",
    spuCode: "DEMO-CANDLE",
    name: "松烟 香薰蜡烛 180g",
    minPrice: 68,
    merchant: "慢物香氛",
    art: "candle",
  },
  {
    spuId: "d10",
    spuCode: "DEMO-BACKPACK",
    name: "远行 通勤双肩包 20L",
    minPrice: 259,
    merchant: "行囊制包",
    art: "backpack",
  },
  {
    spuId: "d11",
    spuCode: "DEMO-TEASET",
    name: "白瓷 茶具四件套",
    minPrice: 188,
    merchant: "铁瓷生活",
    art: "teaSet",
  },
  {
    spuId: "d12",
    spuCode: "DEMO-RICE",
    name: "稻田 东北大米 5kg",
    minPrice: 59,
    merchant: "谷仓食品",
    art: "rice",
  },
];

export const demoCategories: DemoCategory[] = [
  { key: "digital", name: "数码", icon: "digital" },
  { key: "appliance", name: "家电", icon: "appliance" },
  { key: "fashion", name: "服饰", icon: "fashion" },
  { key: "beauty", name: "美妆", icon: "beauty" },
  { key: "food", name: "食品", icon: "food" },
  { key: "home", name: "家居", icon: "home" },
  { key: "sports", name: "运动", icon: "sports" },
  { key: "books", name: "图书", icon: "books" },
];
