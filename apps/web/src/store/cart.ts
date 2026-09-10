import { create } from 'zustand';

export interface CartLine {
  productId: string;
  name: string;
  category?: string;
  barcode?: string;
  tier?: string; // pricing tier display (e.g. قطاعي) — backend prices authoritatively
  unitPrice: number; // display only — backend recalculates authoritatively
  quantity: number;
  stock?: number;
  time: string;
}

interface CartState {
  lines: CartLine[];
  customerId: string | null;
  customerName: string;
  customerBalance: number;
  orderType: 'PICKUP' | 'RECEIVE' | 'DELIVERY';
  deliveryRepId: string | null;
  add: (l: CartLine) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  setCustomer: (id: string | null, name: string, balance?: number) => void;
  setOrderType: (t: CartState['orderType']) => void;
  setDeliveryRep: (id: string | null) => void;
  /** Load a held order back into the active cart (resume from pending tab). */
  loadFromOrder: (o: { items?: any[]; customer?: any; customerId?: string | null; orderType?: CartState['orderType']; deliveryRepId?: string | null }) => void;
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  customerId: null,
  customerName: 'عميل نقدي',
  customerBalance: 0,
  orderType: 'PICKUP',
  deliveryRepId: null,
  add: (l) => set((s) => {
    const ex = s.lines.find((x) => x.productId === l.productId);
    if (ex) return { lines: s.lines.map((x) => (x.productId === l.productId ? { ...x, quantity: x.quantity + l.quantity } : x)) };
    return { lines: [...s.lines, l] };
  }),
  remove: (productId) => set((s) => ({ lines: s.lines.filter((x) => x.productId !== productId) })),
  setQty: (productId, qty) => set((s) => ({ lines: s.lines.map((x) => (x.productId === productId ? { ...x, quantity: qty } : x)) })),
  clear: () => set({ lines: [] }),
  setCustomer: (customerId, customerName, customerBalance = 0) => set({ customerId, customerName, customerBalance }),
  setOrderType: (orderType) => set({ orderType }),
  setDeliveryRep: (deliveryRepId) => set({ deliveryRepId }),
  loadFromOrder: (o) => set({
    lines: (o.items || []).map((i: any) => ({
      productId: i.productId || i.product?.id || String(i.id),
      name: i.productNameSnapshot || i.product?.nameAr || i.product?.name || i.name || '',
      category: i.product?.category?.nameAr || i.product?.category?.name || '',
      barcode: i.product?.barcode || '',
      tier: 'قطاعي',
      unitPrice: Number(i.unitPriceSnapshot ?? i.unitPrice ?? 0),
      quantity: Number(i.quantity),
      stock: i.product?.inventory ? Number(i.product.inventory.quantity) : undefined,
      time: new Date().toLocaleTimeString('ar-EG'),
    })),
    customerId: o.customerId ?? o.customer?.id ?? null,
    customerName: o.customer?.name || 'عميل نقدي',
    customerBalance: Number(o.customer?.balance || 0),
    orderType: (o.orderType as CartState['orderType']) || 'PICKUP',
    deliveryRepId: (o as any).deliveryRepId ?? (o as any).deliveryRep?.id ?? null,
  }),
}));

export function cartTotals(lines: CartLine[]) {
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  return { units: totalQuantity, items: lines.length, total: subtotal };
}
