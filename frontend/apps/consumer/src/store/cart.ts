export interface CartItem {
  cartItemId: string;
  spuId: string;
  skuId: string;
  merchantId: string;
  shopName?: string;
  spuName: string;
  skuName: string;
  unitPriceCents: bigint;
  costPriceCents: bigint;
  quantity: number;
  selected: boolean;
  skuThumbnailUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartState {
  items: CartItem[];
  totalQuantity: number;
}

export interface MerchantGroup {
  merchantId: string;
  items: CartItem[];
}

export interface CartSummary {
  totalQuantity: number;
  totalPriceCents: bigint;
  selectedQuantity: number;
  selectedPriceCents: bigint;
}

export interface CartSnapshot extends CartState {
  summary: CartSummary;
  merchantGroups: MerchantGroup[];
}

const STORAGE_KEY = "ecommerce_cart";

function loadFromStorage(): CartState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        items?: Array<
          Omit<CartItem, "unitPriceCents" | "costPriceCents" | "createdAt" | "updatedAt"> & {
            unitPriceCents: string;
            costPriceCents: string;
            createdAt: string;
            updatedAt: string;
          }
        >;
        totalQuantity?: number;
      };
      return {
        items: (parsed.items || []).map((item) => ({
          ...item,
          unitPriceCents: BigInt(item.unitPriceCents),
          costPriceCents: BigInt(item.costPriceCents),
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
        })),
        totalQuantity: parsed.totalQuantity || 0,
      };
    }
  } catch {
    console.error("Failed to load cart from storage");
  }
  return { items: [], totalQuantity: 0 };
}

function saveToStorage({ items, totalQuantity }: CartState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, totalQuantity }, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  } catch {
    console.error("Failed to save cart to storage");
  }
}

const UPDATE_EVENT = "cart-updated";

export function subscribe(callback: () => void): () => void {
  window.addEventListener(UPDATE_EVENT, callback);
  return () => window.removeEventListener(UPDATE_EVENT, callback);
}

function createSnapshot(items: CartItem[]): CartSnapshot {
  const snapshotItems = items.map((item) => Object.freeze({ ...item }) as CartItem);
  const summary: CartSummary = {
    totalQuantity: 0,
    totalPriceCents: 0n,
    selectedQuantity: 0,
    selectedPriceCents: 0n,
  };
  const groups = new Map<string, MerchantGroup>();
  for (const item of snapshotItems) {
    const price = item.unitPriceCents * BigInt(item.quantity);
    summary.totalQuantity += item.quantity;
    summary.totalPriceCents += price;
    if (item.selected) {
      summary.selectedQuantity += item.quantity;
      summary.selectedPriceCents += price;
    }
    let group = groups.get(item.merchantId);
    if (!group) {
      group = { merchantId: item.merchantId, items: [] };
      groups.set(item.merchantId, group);
    }
    group.items.push(item);
  }
  const merchantGroups = [...groups.values()].map((group) =>
    Object.freeze({ ...group, items: Object.freeze(group.items) }),
  );
  return Object.freeze({
    items: Object.freeze(snapshotItems),
    totalQuantity: summary.totalQuantity,
    summary: Object.freeze(summary),
    merchantGroups: Object.freeze(merchantGroups),
  }) as CartSnapshot;
}

class CartStore {
  private state = createSnapshot(loadFromStorage().items);

  // React 要求未变更时返回同一快照；提交后不能再原地修改旧快照及其条目。
  getSnapshot = (): CartSnapshot => this.state;

  get items(): CartItem[] {
    return this.state.items;
  }

  get totalQuantity(): number {
    return this.state.totalQuantity;
  }

  private commit(items: CartItem[]): void {
    const next = createSnapshot(items);
    this.state = next;
    saveToStorage(next);
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }

  /** 后端快照是替换，不是逐项加购；构造完成后才发布一次。 */
  replaceAll(items: readonly Omit<CartItem, "createdAt" | "updatedAt">[]): void {
    const previousById = new Map(this.state.items.map((item) => [item.cartItemId, item]));
    const now = new Date();
    this.commit(
      items.map((item) => {
        const previous = previousById.get(item.cartItemId);
        return {
          ...item,
          // 当前只有本地选择命令，远端刷新不能把已选择状态覆盖回旧值。
          selected: previous?.selected ?? item.selected,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        };
      }),
    );
  }

  addItem(item: Omit<CartItem, "createdAt" | "updatedAt">): void {
    const existing = this.state.items.find(
      (current) => current.skuId === item.skuId && current.merchantId === item.merchantId,
    );
    const now = new Date();
    this.commit(
      existing
        ? this.state.items.map((current) =>
            current === existing
              ? { ...current, quantity: current.quantity + item.quantity, updatedAt: now }
              : current,
          )
        : [...this.state.items, { ...item, createdAt: now, updatedAt: now }],
    );
  }

  removeItem(cartItemId: string): void {
    const items = this.state.items.filter((item) => item.cartItemId !== cartItemId);
    if (items.length !== this.state.items.length) this.commit(items);
  }

  updateQuantity(cartItemId: string, quantity: number): void {
    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !this.state.items.some((item) => item.cartItemId === cartItemId)
    ) {
      return;
    }
    this.commit(
      this.state.items.map((item) =>
        item.cartItemId === cartItemId ? { ...item, quantity, updatedAt: new Date() } : item,
      ),
    );
  }

  toggleSelect(cartItemId: string): void {
    if (!this.state.items.some((item) => item.cartItemId === cartItemId)) return;
    this.commit(
      this.state.items.map((item) =>
        item.cartItemId === cartItemId ? { ...item, selected: !item.selected } : item,
      ),
    );
  }

  selectAll(selected: boolean): void {
    if (this.state.items.every((item) => item.selected === selected)) return;
    this.commit(this.state.items.map((item) => ({ ...item, selected })));
  }

  selectByMerchant(merchantId: string, selected: boolean): void {
    if (
      !this.state.items.some((item) => item.merchantId === merchantId && item.selected !== selected)
    ) {
      return;
    }
    this.commit(
      this.state.items.map((item) =>
        item.merchantId === merchantId ? { ...item, selected } : item,
      ),
    );
  }

  clear(): void {
    if (this.state.items.length === 0) return;
    this.commit([]);
  }

  getSelectedItems(): CartItem[] {
    return this.state.items.filter((item) => item.selected);
  }

  getMerchantGroups(): MerchantGroup[] {
    return this.state.merchantGroups;
  }

  getSummary(): CartSummary {
    return this.state.summary;
  }
}

export const cartStore = new CartStore();
