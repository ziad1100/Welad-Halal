/** Receipt data mapped 1:1 from the finalized saved Order — never from cart input. */
export interface ReceiptLine {
  name: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptData {
  invoiceNumber: string;
  /** Raw sequential order number — rendered as "طلب #N" or a reference code per config. */
  orderNumber: number;
  /** Gregorian date DD/MM/YYYY (Arabic-numeral display, Latin digits like the reference printout). */
  date: string;
  /** 24h→12h time with Arabic marker: "01:30 م" / "11:05 ص". */
  time: string;
  cashier: string;
  /** Defaults to the generic walk-in label "عميل" (cash-customer flow). */
  customer?: string;
  orderType?: string;
  /** Arabic status label, e.g. "تم التأكيد" once F12 confirm ran. */
  statusAr?: string;
  /** Payment method label, e.g. "نقدي". */
  paymentMethod?: string;
  /** Delivery fee — printed only when > 0 (pickup orders omit the line entirely). */
  deliveryFee?: number;
  lines: ReceiptLine[];
  totalItems: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  isCopy: boolean;

  // ── §1 receipt enhancements ──────────────────────────────────────────────
  /** True → RETURN RECEIPT variant (إيصال مرتجع) printed from a returned order. */
  isReturn?: boolean;
  /** Link back to the original sale for traceability on the return receipt. */
  originalOrderNumber?: number;
  /** Non-sequential public token → QR destination URL (no login, no guessing). */
  publicToken?: string;
  /** Store contact line, e.g. "01234567890" — printed as للتواصل: under the QR. */
  storePhone?: string;
  /** Full public URL encoding into the receipt QR code (from publicToken). */
  qrText?: string;
}

/** §1 — helper to turn a returned order into a RETURN RECEIPT. */
export function orderToReturnReceipt(order: any, isCopy = false): ReceiptData {
  const base = orderToReceipt(order, isCopy);
  return {
    ...base,
    isReturn: true,
    originalOrderNumber: Number(order.orderNumber),
    // Quantities/amounts are shown as negative on the return printout.
    lines: (order.items || []).map((i: any) => ({
      name: i.productNameSnapshot,
      variant: undefined,
      quantity: -Math.abs(Number(i.quantity)),
      unitPrice: Number(i.unitPriceSnapshot),
      lineTotal: -Math.abs(Number(i.lineTotal)),
    })),
    totalItems: order.totalItems ?? (order.items || []).length,
    subtotal: -Math.abs(Number(order.subtotal ?? 0)),
    discount: -Math.abs(Number(order.discount ?? 0)),
    total: -Math.abs(Number(order.total ?? 0)),
  };
}

export type PaperWidth = 58 | 80;

export type OrderRefStyle = 'number' | 'code';

export interface PrinterConfig {
  printerName: string;
  paperWidth: PaperWidth;
  autoPrint: boolean;
  openCashDrawer: boolean;
  /** "طلب #<N>" (default) or a generated reference code like "WH-037496-6480". */
  orderRefStyle: OrderRefStyle;
  // Store branding + footer are hardcoded per the Welad Halal print spec — never configurable.
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  printerName: '',
  paperWidth: 80,
  autoPrint: true,
  openCashDrawer: true,
  orderRefStyle: 'number',
};

/** Hardcoded on receipts per spec — NOT pulled from settings. */
export const STORE_NAME_AR = 'ولاد حلال';
export const FOOTER_AR = 'شكراً لتسوقك من ولاد حلال';
export const FOOTER_EN = 'Thank you for shopping with Welad Halal!';

export type PrintStatus = 'idle' | 'printing' | 'success' | 'failed';

export const ORDER_TYPE_AR: Record<string, string> = { PICKUP: 'استلام', RECEIVE: 'استقبال', DELIVERY: 'توصيل' };

/** Receipt-local status wording (spec: confirmed → "تم التأكيد"). */
export const STATUS_AR: Record<string, string> = {
  PENDING: 'معلق', HELD: 'محجوز', CONFIRMED: 'تم التأكيد', COMPLETED: 'مكتمل', CANCELLED: 'ملغي', RETURNED: 'مرتجع',
};

function arDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function arTime(d: Date): string {
  const h24 = d.getHours();
  const h = String(h24 % 12 || 12).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m} ${h24 >= 12 ? 'م' : 'ص'}`;
}

/** Map a saved backend order (any shape) onto receipt data. Totals copied verbatim. */
export function orderToReceipt(order: any, isCopy = false, opts?: { storePhone?: string }): ReceiptData {
  const d = new Date(order.createdAt);
  return {
    invoiceNumber: String(order.orderNumber).padStart(6, '0'),
    orderNumber: Number(order.orderNumber),
    date: arDate(d),
    time: arTime(d),
    cashier: order.createdBy?.fullName || order.createdBy?.username || '—',
    customer: order.customer?.name || 'عميل',
    orderType: order.orderType ? ORDER_TYPE_AR[order.orderType] || order.orderType : undefined,
    statusAr: STATUS_AR[order.status] || order.status,
    // §4 — orders now carry paymentMethod; Arabic label on the receipt always.
    paymentMethod: order.paymentMethod === 'CARD' ? 'بطاقة' : 'نقدي',
    deliveryFee: Number(order.deliveryFee ?? 0) || 0,
    lines: (order.items || []).map((i: any) => ({
      // Variants are part of the snapshot name (e.g. "صنف - 500 جم"); never merged.
      name: i.productNameSnapshot,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPriceSnapshot),
      lineTotal: Number(i.lineTotal),
    })),
    totalItems: order.totalItems ?? (order.items || []).length,
    subtotal: Number(order.subtotal ?? 0),
    discount: Number(order.discount ?? 0),
    tax: Number(order.tax ?? 0),
    total: Number(order.total ?? 0),
    isCopy,
    publicToken: order.publicToken || undefined,
    storePhone: opts?.storePhone || undefined,
    qrText: order.publicToken ? publicOrderUrl(order.publicToken) : undefined,
  };
}

/**
 * §1 — public no-login URL for an order token. Must be usable from the
 * customer's phone (real origin, not localhost when in the browser).
 */
export function publicOrderUrl(token: string): string {
  const base =
    typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
      ? window.location.origin + window.location.pathname.replace(/\/+$/, '')
      : '';
  // HashRouter routes: public page is reachable without auth at #/order/<token>.
  return `${base}${base.endsWith('/') ? '' : '/'}#/order/${encodeURIComponent(token)}`;
}
