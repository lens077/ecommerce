/**
 * 购物车状态管理
 *
 * 使用简单的发布-订阅模式实现全局状态同步
 * 数据持久化到 localStorage
 */


// Types


export interface CartItem {
  cartItemId: string;
  spuId: string;
  skuId: string;
  merchantId: string;
  merchantName?: string;
  spuName: string;
  skuName: string;
  price: number;
  costPrice: number;
  quantity: number;
  selected: boolean;
  skuThumbnailUrl: string;
  status: "active" | "expired" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}

export interface CartState {
  items: CartItem[];
  totalQuantity: number;
}

export interface MerchantGroup {
  merchantId: string;
  merchantName: string;
  items: CartItem[];
}

export interface CartSummary {
  totalQuantity: number;
  totalPrice: number;
  selectedQuantity: number;
  selectedPrice: number;
}


// Storage


const STORAGE_KEY = "ecommerce_cart";

function loadFromStorage(): CartState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        items: parsed.items || [],
        totalQuantity: parsed.totalQuantity || 0,
      };
    }
  } catch {
    console.error("Failed to load cart from storage");
  }
  return { items: [], totalQuantity: 0 };
}

function saveToStorage(state: CartState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    console.error("Failed to save cart to storage");
  }
}


// Event System


const UPDATE_EVENT = "cart-updated";

function emitUpdate(): void {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function subscribe(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}


// Cart Store


class CartStore {
  private state: CartState;

  constructor() {
    this.state = loadFromStorage();
  }

  get items(): CartItem[] {
    return this.state.items;
  }

  get totalQuantity(): number {
    return this.state.totalQuantity;
  }

  private recalculateTotal(): void {
    this.state.totalQuantity = this.state.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
  }

  private persist(): void {
    saveToStorage(this.state);
    emitUpdate();
  }

  /**
   * 添加商品到购物车
   */
  addItem(item: Omit<CartItem, "cartItemId" | "createdAt" | "updatedAt">): void {
    const existingIndex = this.state.items.findIndex(
      (i) => i.skuId === item.skuId && i.merchantId === item.merchantId
    );

    if (existingIndex >= 0) {
      // 已存在，增加数量
      this.state.items[existingIndex].quantity += item.quantity;
      this.state.items[existingIndex].updatedAt = new Date();
    } else {
      // 新增
      const now = new Date();
      this.state.items.push({
        ...item,
        cartItemId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    this.recalculateTotal();
    this.persist();
  }

  /**
   * 从购物车移除商品
   */
  removeItem(cartItemId: string): void {
    const index = this.state.items.findIndex((i) => i.cartItemId === cartItemId);
    if (index >= 0) {
      this.state.items.splice(index, 1);
      this.recalculateTotal();
      this.persist();
    }
  }

  /**
   * 更新商品数量
   */
  updateQuantity(cartItemId: string, quantity: number): void {
    const item = this.state.items.find((i) => i.cartItemId === cartItemId);
    if (item && quantity > 0) {
      item.quantity = quantity;
      item.updatedAt = new Date();
      this.recalculateTotal();
      this.persist();
    }
  }

  /**
   * 切换选中状态
   */
  toggleSelect(cartItemId: string): void {
    const item = this.state.items.find((i) => i.cartItemId === cartItemId);
    if (item) {
      item.selected = !item.selected;
      emitUpdate();
    }
  }

  /**
   * 全选/取消全选
   */
  selectAll(selected: boolean): void {
    this.state.items.forEach((item) => {
      item.selected = selected;
    });
    emitUpdate();
  }

  /**
   * 按商家全选/取消全选
   */
  selectByMerchant(merchantId: string, selected: boolean): void {
    this.state.items.forEach((item) => {
      if (item.merchantId === merchantId) {
        item.selected = selected;
      }
    });
    emitUpdate();
  }

  /**
   * 清空购物车
   */
  clear(): void {
    this.state.items = [];
    this.state.totalQuantity = 0;
    this.persist();
  }

  /**
   * 获取选中的商品
   */
  getSelectedItems(): CartItem[] {
    return this.state.items.filter((item) => item.selected);
  }

  /**
   * 获取按商家分组的购物车
   */
  getMerchantGroups(): MerchantGroup[] {
    const groups = new Map<string, MerchantGroup>();

    this.state.items.forEach((item) => {
      if (!groups.has(item.merchantId)) {
        groups.set(item.merchantId, {
          merchantId: item.merchantId,
          merchantName: item.merchantName || `商家 ${item.merchantId.slice(0, 6)}`,
          items: [],
        });
      }
      groups.get(item.merchantId)!.items.push(item);
    });

    return Array.from(groups.values());
  }

  /**
   * 获取购物车汇总
   */
  getSummary(): CartSummary {
    const selectedItems = this.state.items.filter((item) => item.selected);
    return {
      totalQuantity: this.state.totalQuantity,
      totalPrice: this.state.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      ),
      selectedQuantity: selectedItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      ),
      selectedPrice: selectedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      ),
    };
  }
}

// 单例导出
export const cartStore = new CartStore();
