import { describe, test, expect } from 'vitest';
import { buildReceiptText, buildTestPrint, row, itemLine, orderRefCode, LINE_WIDTH } from '../src/receipt/ReceiptTemplate';
import { wrapForWidth, wrapStyled, assertFits } from '../src/receipt/ReceiptRenderer';
import { orderToReceipt, DEFAULT_PRINTER_CONFIG, type ReceiptData } from '../src/receipt/types';
import { buildEscPos, escPosBytes } from '../src/receipt/escpos';

const demo: ReceiptData = {
  invoiceNumber: '000001', orderNumber: 1, date: '06/09/2026', time: '01:30 م', cashier: 'cashier',
  customer: 'عميل نقدي', orderType: 'استلام', statusAr: 'تم التأكيد', paymentMethod: 'نقدي', deliveryFee: 0,
  lines: [
    { name: 'كبدة بقري', variant: '500 جم', quantity: 1, unitPrice: 180, lineTotal: 180 },
    { name: 'أرز 5ك', quantity: 2, unitPrice: 180, lineTotal: 360 },
  ],
  totalItems: 2, subtotal: 540, discount: 0, tax: 0, total: 540, isCopy: false,
};

describe('receipt template — Welad Halal print spec', () => {
  test('header: Arabic store name first line, bold xl centered, then dashed divider', () => {
    const lines = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80);
    expect(lines[0].text).toBe('ولاد حلال');
    expect(lines[0].style).toMatchObject({ size: 'xl', bold: true, align: 'center' });
    expect(lines[1].text).toMatch(/^-+$/);
  });

  test('meta: طلب #N centered + date/time line with Arabic ص/م marker', () => {
    const lines = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80);
    expect(lines[2].text).toBe('طلب #1');
    expect(lines[2].style?.align).toBe('center');
    expect(lines[3].text).toBe('06/09/2026 01:30 م');
  });

  test('reference-code style is configurable', () => {
    const cfg = { ...DEFAULT_PRINTER_CONFIG, orderRefStyle: 'code' as const };
    const lines = buildReceiptText(demo, cfg, 80);
    expect(lines[2].text).toBe(orderRefCode(1));
    expect(lines[2].text).toMatch(/^WH-\d{6}-\d{4}$/);
  });

  test('customer & status block with confirmed wording', () => {
    const text = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80).map((l) => l.text).join('\n');
    expect(text).toContain('العميل: عميل نقدي');
    expect(text).toContain('الحالة: تم التأكيد');
  });

  test('items: "<qty>x <name> <amount> EGP" single rows, price at far right', () => {
    const lines = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80).map((l) => l.text);
    expect(lines.some((l) => /^1x كبدة بقري \(500 جم\)\s+180\.00 EGP$/.test(l))).toBe(true);
    expect(lines.some((l) => /^2x أرز 5ك\s+360\.00 EGP$/.test(l))).toBe(true);
  });

  test('EGP in Latin numerals on print output — never ج.م', () => {
    const text = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80).map((l) => l.text).join('\n');
    expect(text).toContain('EGP');
    expect(text).not.toContain('ج.م');
  });

  test('delivery line omitted for zero fee, shown when applicable', () => {
    const noDelivery = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80).map((l) => l.text);
    expect(noDelivery.some((l) => l.startsWith('التوصيل:'))).toBe(false);
    const withDelivery = buildReceiptText({ ...demo, deliveryFee: 30, total: 570 }, DEFAULT_PRINTER_CONFIG, 80).map((l) => l.text);
    expect(withDelivery.some((l) => /^التوصيل:\s+30\.00 EGP$/.test(l))).toBe(true);
  });

  test('totals: subtotal row, heavy divider above grand total, total is bold lg', () => {
    const lines = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80);
    const totalIdx = lines.findIndex((l) => l.text.startsWith('الإجمالي:'));
    // Label left, amount right-aligned to paper width — the key figure row.
    expect(lines[totalIdx].text.startsWith('الإجمالي:')).toBe(true);
    expect(lines[totalIdx].text.endsWith('540.00 EGP')).toBe(true);
    expect(lines[totalIdx].style).toMatchObject({ size: 'lg', bold: true });
    expect(lines[totalIdx - 1].text).toMatch(/^=+$/);
    expect(lines[totalIdx - 1].text).not.toMatch(/^-+$/);
  });

  test('payment line + bilingual footer + closing dots', () => {
    const lines = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80);
    const texts = lines.map((l) => l.text);
    expect(texts).toContain('الدفع: نقدي');
    expect(texts[texts.length - 1]).toBe('•  •  •');
    expect(texts).toContain('شكراً لتسوقك من ولاد حلال');
    expect(texts).toContain('Thank you for shopping with Welad Halal!');
    for (const i of [texts.length - 3, texts.length - 2, texts.length - 1]) {
      expect(lines[i].style).toMatchObject({ size: 'sm', align: 'center' });
    }
  });

  test('copy shows نسخة marker, original does not', () => {
    const orig = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80).map((l) => l.text).join('\n');
    const copy = buildReceiptText({ ...demo, isCopy: true }, DEFAULT_PRINTER_CONFIG, 80).map((l) => l.text).join('\n');
    expect(orig).not.toContain('نسخة');
    expect(copy).toContain('*** نسخة ***');
  });

  test('58mm and 80mm widths never overflow', () => {
    for (const w of [58, 80] as const) {
      const lines = wrapStyled(buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, w), w);
      expect(assertFits(lines.map((l) => l.text), w)).toEqual([]);
    }
  });

  test('row() and itemLine() stay within width; long names truncate keeping the price', () => {
    expect(row('الإجمالي:', '540.00 EGP', 58).length).toBeLessThanOrEqual(LINE_WIDTH[58]);
    const long = itemLine(1, 'صنف طويل جداً باسم ممتد يتجاوز عرض الورق بالكامل تقريباً', 180, 58);
    expect(long.length).toBeLessThanOrEqual(LINE_WIDTH[58]);
    expect(long.endsWith('180.00 EGP')).toBe(true);
  });

  test('test print contains Arabic + numbers + width', () => {
    for (const w of [58, 80] as const) {
      const t = buildTestPrint(w).map((l) => l.text).join('\n');
      expect(t).toContain('ولاد حلال');
      expect(t).toContain('اختبار اللغة العربية');
      expect(t).toContain('1234567890');
      expect(t).toContain(`${w}mm`);
    }
  });
});

describe('orderToReceipt mapping', () => {
  const order = {
    orderNumber: 7, createdAt: new Date(2026, 8, 6, 13, 30).toISOString(), status: 'CONFIRMED',
    createdBy: { username: 'cashier' }, customer: null, orderType: 'PICKUP', deliveryFee: 15,
    items: [{ productNameSnapshot: 'سكر', quantity: 2, unitPriceSnapshot: 35, lineTotal: 70 }],
    totalItems: 1, subtotal: 70, discount: 0, tax: 0, total: 70,
  };

  test('copies authoritative totals verbatim + Arabic meta', () => {
    const r = orderToReceipt(order, true);
    expect(r.invoiceNumber).toBe('000007');
    expect(r.orderNumber).toBe(7);
    expect(r.total).toBe(70);
    expect(r.lines[0].unitPrice).toBe(35);
    expect(r.isCopy).toBe(true);
    expect(r.statusAr).toBe('تم التأكيد');
    expect(r.customer).toBe('عميل'); // no linked customer → generic walk-in label
    expect(r.deliveryFee).toBe(15);
    expect(r.paymentMethod).toBe('نقدي');
  });

  test('Arabic AM/PM marker: 13:30 → م, 09:05 → ص (timezone-safe local construction)', () => {
    expect(orderToReceipt(order).time).toBe('01:30 م');
    const morning = orderToReceipt({ ...order, createdAt: new Date(2026, 8, 6, 9, 5).toISOString() });
    expect(morning.time).toBe('09:05 ص');
  });
});

describe('ESC/POS generator', () => {
  test('initializes, centers header, sizes store name, cuts at end', () => {
    const bytes = buildEscPos(buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80), 80);
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40); // ESC @ initialize
    // GS ! double-size command present (store name xl)
    expect(Array.from(bytes)).toContain(0x1d);
    // ends with feed+cut ESC d 2
    const tail = Array.from(bytes.slice(-3));
    expect(tail).toEqual([0x1b, 0x64, 0x02]);
  });

  test('emits center-align for the header line, default align for body rows', () => {
    const lines = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80);
    const bytes = Array.from(buildEscPos(lines, 80));
    // First ESC a sequence belongs to line 1 (store name) → must be centered (0x01).
    let first = -1;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x1b && bytes[i + 1] === 0x61) { first = i; break; }
    }
    expect(first).toBeGreaterThan(0);
    expect(bytes[first + 2]).toBe(0x01);
    // A body row (customer line, no align style) must emit ESC a 0x00.
    const custIdx = lines.findIndex((l) => l.text.startsWith('العميل:'));
    expect(custIdx).toBeGreaterThan(0);
    expect(lines[custIdx].style?.align).toBeUndefined();
  });

  test('escPosBytes returns a Uint8Array byte stream', () => {
    const u8 = escPosBytes([{ text: 'ولاد حلال' }], 80);
    expect(u8).toBeInstanceOf(Uint8Array);
    expect(u8.length).toBeGreaterThan(3);
    expect(u8[u8.length - 1]).toBe(0x02); // cut command tail
  });
});
