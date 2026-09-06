import type { ReceiptData, PaperWidth, PrinterConfig } from './types';

export const LINE_WIDTH: Record<PaperWidth, number> = { 58: 32, 80: 48 };

export function sep(width: PaperWidth): string {
  return '-'.repeat(LINE_WIDTH[width]);
}
export function dbl(width: PaperWidth): string {
  return '='.repeat(LINE_WIDTH[width]);
}

/** Pad an Arabic-label + Latin-number row without overflowing the paper. */
export function row(label: string, value: string, width: PaperWidth): string {
  const w = LINE_WIDTH[width];
  const v = value.length > w - 2 ? value.slice(0, w - 2) : value;
  const lbl = label.length + v.length + 1 > w ? label.slice(0, Math.max(0, w - v.length - 1)) : label;
  return `${lbl}${' '.repeat(w - lbl.length - v.length)}${v}`;
}

export function money(n: number): string {
  return `${Number(n).toFixed(2)} ج.م`;
}

/** Build the logical receipt lines (layout-agnostic; renderer wraps for width). */
export function buildReceiptText(r: ReceiptData, cfg: PrinterConfig, width: PaperWidth): string[] {
  const L: string[] = [];
  L.push(cfg.businessNameAr);
  L.push(cfg.businessNameEn);
  L.push(sep(width));
  L.push('فاتورة بيع');
  if (r.isCopy) L.push('*** نسخة ***');
  L.push(`رقم الفاتورة: ${r.invoiceNumber}`);
  L.push(`التاريخ: ${r.date}`);
  L.push(`الوقت: ${r.time}`);
  L.push(`الكاشير: ${r.cashier}`);
  if (r.customer) L.push(`العميل: ${r.customer}`);
  if (r.orderType) L.push(`نوع الطلب: ${r.orderType}`);
  L.push(sep(width));
  L.push('الصنف');
  L.push('الكمية × السعر');
  L.push('الإجمالي');
  L.push(sep(width));
  for (const it of r.lines) {
    L.push(it.variant ? `${it.name} - ${it.variant}` : it.name);
    L.push(`${it.quantity} × ${Number(it.unitPrice).toFixed(2)}`);
    L.push(money(it.lineTotal));
    L.push('');
  }
  L.push(sep(width));
  L.push(row('عدد الأصناف:', String(r.totalItems), width));
  L.push('');
  L.push(row('الإجمالي الفرعي:', money(r.subtotal), width));
  L.push(row('الخصم:', money(r.discount), width));
  if (r.tax > 0) L.push(row('الضريبة:', money(r.tax), width));
  L.push(sep(width));
  L.push(row('الإجمالي النهائي:', money(r.total), width));
  L.push(sep(width));
  L.push(cfg.footerLine1);
  L.push(cfg.footerLine2);
  L.push('');
  L.push(cfg.businessNameAr);
  return L;
}

export function buildTestPrint(width: PaperWidth): string[] {
  return [
    dbl(width),
    'اختبار الطباعة',
    'فريزر البلد',
    dbl(width),
    '',
    'اختبار اللغة العربية',
    'Arabic Test',
    '',
    '1234567890',
    '0123456789',
    '',
    `اختبار ${width}mm`,
    '',
    dbl(width),
  ];
}
