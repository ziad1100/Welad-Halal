import type { ReceiptData, PaperWidth, PrinterConfig } from './types';
import { STORE_NAME_AR, FOOTER_AR, FOOTER_EN } from './types';

export const LINE_WIDTH: Record<PaperWidth, number> = { 58: 32, 80: 48 };

/**
 * A receipt line plus how it should be emphasized when rendered (browser
 * preview, print window, or ESC/POS commands). Plain-text template stays the
 * single source of truth so all three outputs stay structurally identical.
 */
export interface LineStyle {
  /** xl = store name, lg = grand total, sm = footer, normal = everything else. */
  size?: 'xl' | 'lg' | 'normal' | 'sm';
  bold?: boolean;
  /** RTL text right-aligns naturally; center is for header/footer/dividers. */
  align?: 'center' | 'start';
  /** §1 — marker: renderers that can draw graphics show a QR of this URL. */
  qr?: boolean;
  qrUrl?: string;
}

export interface StyledLine {
  text: string;
  style?: LineStyle;
}

export function sep(width: PaperWidth): string {
  return '-'.repeat(LINE_WIDTH[width]);
}
/** Heavy divider directly above the grand total — visually stronger than the dashed separators. */
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

/** Item line: "<qty>x <name>" with the price in EGP at the far-right column. */
export function itemLine(quantity: number, name: string, lineTotal: number, width: PaperWidth): string {
  const w = LINE_WIDTH[width];
  const label = `${quantity}x ${name}`;
  const price = money(lineTotal);
  const space = Math.max(1, w - label.length - price.length);
  const padded = label + ' '.repeat(space) + price;
  return padded.length > w ? label.slice(0, Math.max(1, w - price.length - 1)) + ' ' + price : padded;
}

/** Receipts print "EGP" in Latin numerals per the reference printout (UI uses ج.م elsewhere). */
export function money(n: number): string {
  return `${Number(n).toFixed(2)} EGP`;
}

/** Stable per-order reference code, e.g. "WH-037496-6480" (configurable alternative to طلب #N). */
export function orderRefCode(orderNumber: number): string {
  const seq = String(orderNumber).padStart(6, '0');
  const suffix = String((orderNumber * 7919) % 10000).padStart(4, '0');
  return `WH-${seq}-${suffix}`;
}

function refLine(r: ReceiptData, cfg: PrinterConfig): string {
  return cfg.orderRefStyle === 'code' ? orderRefCode(r.orderNumber) : `طلب #${r.orderNumber}`;
}

/** §1 — QR marker: the public order URL lives here; renderers draw the code. */
export function qrLine(url: string): StyledLine {
  // QR data is carried in the style (never the printable text), so text-only
  // renderers (ESC/POS, preview) stay byte-identical unless they draw graphics.
  return { text: '', style: { align: 'center', qr: true, qrUrl: url } };
}

/** §1 — a strongly bordered emphasis band, used to flag RETURN receipts. */
function returnBand(text: string, width: PaperWidth): StyledLine[] {
  const edge = width === 58 ? '+-+-+-+-+-' : '+--+--+--+--+--+--+--+--+--+--+';
  return [
    { text: edge, style: { align: 'center' } },
    { text: `* ${text} *`, style: { size: 'lg', bold: true, align: 'center' } },
    { text: edge, style: { align: 'center' } },
  ];
}

/** Build the logical receipt lines (layout-agnostic; renderer wraps for width). */
export function buildReceiptText(r: ReceiptData, cfg: PrinterConfig, width: PaperWidth): StyledLine[] {
  const L: StyledLine[] = [];

  // 1. Header — store name, largest/bold/centered, then dashed divider.
  L.push({ text: STORE_NAME_AR, style: { size: 'xl', bold: true, align: 'center' } });

  // §1 RETURN RECEIPT — unmistakable bordered "إيصال مرتجع" under the store name.
  if (r.isReturn) {
    L.push(...returnBand('إيصال مرتجع', width));
    if (r.originalOrderNumber) L.push({ text: `مرتجع عن طلب #${r.originalOrderNumber}`, style: { align: 'center' } });
    L.push({ text: sep(width), style: { align: 'center' } });
    L.push({ text: refLine(r, cfg), style: { align: 'center' } });
    L.push({ text: `${r.date} ${r.time}`, style: { align: 'center' } });
    if (r.isCopy) L.push({ text: '*** نسخة ***', style: { align: 'center' } });
    L.push({ text: sep(width), style: { align: 'center' } });
    if (r.customer) L.push({ text: `العميل: ${r.customer}` });
    L.push({ text: sep(width), style: { align: 'center' } });

    // 4r. Returned line items — negative quantities, explicit (مرتجع) tag.
    for (const it of r.lines) {
      const name = it.variant ? `${it.name} (${it.variant})` : it.name;
      L.push({ text: itemLine(it.quantity, `${name} (مرتجع)`, it.lineTotal, width) });
    }
    L.push({ text: sep(width), style: { align: 'center' } });
    L.push({ text: row('إجمالي المسترجع:', money(r.total), width), style: { size: 'lg', bold: true } });

    // §1 — same QR/contact block as the standard receipt (traceability + service).
    if (r.qrText) {
      L.push({ text: '' });
      L.push(qrLine(r.qrText));
    }
    if (r.storePhone) {
      L.push({ text: row('للتواصل:', r.storePhone, width) });
    }

    // Footer.
    L.push({ text: '' });
    L.push({ text: FOOTER_AR, style: { size: 'sm', align: 'center' } });
    L.push({ text: FOOTER_EN, style: { size: 'sm', align: 'center' } });
    L.push({ text: '•  •  •', style: { size: 'sm', align: 'center' } });
    return L;
  }

  L.push({ text: sep(width), style: { align: 'center' } });

  // 2. Order meta — number/reference + Arabic AM/PM date-time, centered.
  L.push({ text: refLine(r, cfg), style: { align: 'center' } });
  L.push({ text: `${r.date} ${r.time}`, style: { align: 'center' } });
  if (r.isCopy) L.push({ text: '*** نسخة ***', style: { align: 'center' } });
  L.push({ text: sep(width), style: { align: 'center' } });

  // 3. Customer & status — plain RTL lines.
  if (r.customer) L.push({ text: `العميل: ${r.customer}` });
  if (r.statusAr) L.push({ text: `الحالة: ${r.statusAr}` });
  L.push({ text: sep(width), style: { align: 'center' } });

  // 4. Line items — one "1x name … 180 EGP" row per item.
  for (const it of r.lines) {
    const name = it.variant ? `${it.name} (${it.variant})` : it.name;
    L.push({ text: itemLine(it.quantity, name, it.lineTotal, width) });
  }
  L.push({ text: sep(width), style: { align: 'center' } });

  // 5. Totals — labels left, values right; delivery line only when nonzero;
  //    heavy double divider, then the grand total as the biggest line on the receipt.
  L.push({ text: row('المجموع الفرعي:', money(r.subtotal), width) });
  if (r.discount > 0) L.push({ text: row('الخصم:', money(r.discount), width) });
  if (r.tax > 0) L.push({ text: row('الضريبة:', money(r.tax), width) });
  if ((r.deliveryFee ?? 0) > 0) L.push({ text: row('التوصيل:', money(r.deliveryFee!), width) });
  L.push({ text: dbl(width), style: { align: 'center' } });
  L.push({ text: row('الإجمالي:', money(r.total), width), style: { size: 'lg', bold: true } });

  // 6. Payment method — small gap, no divider.
  L.push({ text: '' });
  L.push({ text: `الدفع: ${r.paymentMethod || 'نقدي'}` });

  // 6b. §1 — QR code (public order link) then store contact, above the footer.
  if (r.qrText) {
    L.push({ text: '' });
    L.push(qrLine(r.qrText));
  }
  if (r.storePhone) {
    L.push({ text: row('للتواصل:', r.storePhone, width) });
  }

  // 7. Footer — smallest, centered, closing dots.
  L.push({ text: '' });
  L.push({ text: FOOTER_AR, style: { size: 'sm', align: 'center' } });
  L.push({ text: FOOTER_EN, style: { size: 'sm', align: 'center' } });
  L.push({ text: '•  •  •', style: { size: 'sm', align: 'center' } });

  return L;
}

export function buildTestPrint(width: PaperWidth): StyledLine[] {
  return [
    { text: dbl(width), style: { align: 'center' } },
    { text: STORE_NAME_AR, style: { size: 'xl', bold: true, align: 'center' } },
    { text: dbl(width), style: { align: 'center' } },
    { text: 'اختبار اللغة العربية', style: { align: 'center' } },
    { text: 'Arabic Test', style: { align: 'center' } },
    { text: '' },
    { text: '1234567890', style: { align: 'center' } },
    { text: '0123456789', style: { align: 'center' } },
    { text: '' },
    { text: `اختبار ${width}mm`, style: { align: 'center' } },
    { text: '' },
    { text: dbl(width), style: { align: 'center' } },
  ];
}
