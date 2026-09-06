import { create } from 'zustand';

export interface CartLine {
  productId: string;
  name: string;
  category?: string;
  barcode?: string;
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
  add: (l: CartLine) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  setCustomer: (id: string | null, name: string, balance?: number) => void;
  setOrderType: (t: CartState['orderType']) => void;
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  customerId: null,
  customerName: 'عميل نقدي',
  customerBalance: 0,
  orderType: 'PICKUP',
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
}));

export function cartTotals(lines: CartLine[]) {
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  return { units: totalQuantity, items: lines.length, total: subtotal };
}
