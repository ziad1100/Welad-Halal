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
  date: string;
  time: string;
  cashier: string;
  customer?: string;
  orderType?: string;
  lines: ReceiptLine[];
  totalItems: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  isCopy: boolean;
}

export type PaperWidth = 58 | 80;

export interface PrinterConfig {
  printerName: string;
  paperWidth: PaperWidth;
  autoPrint: boolean;
  openCashDrawer: boolean;
  businessNameAr: string;
  businessNameEn: string;
  footerLine1: string;
  footerLine2: string;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  printerName: '',
  paperWidth: 80,
  autoPrint: true,
  openCashDrawer: true,
  businessNameAr: 'فريزر البلد',
  businessNameEn: 'FREEZER EL BALAD',
  footerLine1: 'شكراً لتعاملكم معنا',
  footerLine2: 'نتمنى لكم يوماً سعيداً',
};

export type PrintStatus = 'idle' | 'printing' | 'success' | 'failed';

export const ORDER_TYPE_AR: Record<string, string> = { PICKUP: 'استلام', RECEIVE: 'استقبال', DELIVERY: 'توصيل' };

/** Map a saved backend order (any shape) onto receipt data. Totals copied verbatim. */
export function orderToReceipt(order: any, isCopy = false): ReceiptData {
  const d = new Date(order.createdAt);
  return {
    invoiceNumber: String(order.orderNumber).padStart(6, '0'),
    date: d.toLocaleDateString('en-GB'),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    cashier: order.createdBy?.name || order.createdBy?.username || '—',
    customer: order.customer?.name,
    orderType: order.orderType ? ORDER_TYPE_AR[order.orderType] || order.orderType : undefined,
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
  };
}
