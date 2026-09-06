import { describe, test, expect } from 'vitest';
import { buildReceiptText, buildTestPrint, row, LINE_WIDTH } from '../src/receipt/ReceiptTemplate';
import { wrapForWidth, assertFits } from '../src/receipt/ReceiptRenderer';
import { orderToReceipt, DEFAULT_PRINTER_CONFIG, type ReceiptData } from '../src/receipt/types';

const demo: ReceiptData = {
  invoiceNumber: '000001', date: '06/09/2026', time: '01:30 PM', cashier: 'cashier',
  customer: 'عميل نقدي', orderType: 'استلام',
  lines: [
    { name: 'لحمة مفرومة', variant: '500 جم', quantity: 1, unitPrice: 150, lineTotal: 150 },
    { name: 'لحمة مفرومة', variant: '1 كيلو', quantity: 1, unitPrice: 280, lineTotal: 280 },
    { name: 'فراخ بانيه', quantity: 2, unitPrice: 180, lineTotal: 360 },
  ],
  totalItems: 3, subtotal: 790, discount: 20, tax: 0, total: 770, isCopy: false,
};

describe('receipt template', () => {
  test('single line total 250', () => {
    const r: ReceiptData = { ...demo, lines: [{ name: 'لحمة مفرومة', quantity: 1, unitPrice: 250, lineTotal: 250 }], totalItems: 1, subtotal: 250, discount: 0, total: 250 };
    const text = buildReceiptText(r, DEFAULT_PRINTER_CONFIG, 80).join('\n');
    expect(text).toContain('لحمة مفرومة');
    expect(text).toContain('250.00 ج.م');
    expect(text).toContain('رقم الفاتورة: 000001');
  });

  test('totals block: subtotal/discount/final', () => {
    const text = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80).join('\n');
    expect(text).toContain('790.00 ج.م');
    expect(text).toContain('20.00 ج.م');
    expect(text).toContain('770.00 ج.م');
  });

  test('500g vs 1kg variants print as separate lines', () => {
    const lines = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80);
    expect(lines).toContain('لحمة مفرومة - 500 جم');
    expect(lines).toContain('لحمة مفرومة - 1 كيلو');
  });

  test('copy shows نسخة marker, original does not', () => {
    const orig = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80).join('\n');
    const copy = buildReceiptText({ ...demo, isCopy: true }, DEFAULT_PRINTER_CONFIG, 80).join('\n');
    expect(orig).not.toContain('نسخة');
    expect(copy).toContain('*** نسخة ***');
  });

  test('no phone numbers on receipt', () => {
    const text = buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, 80).join('\n');
    expect(text).not.toMatch(/تليفون|هاتف|phone/i);
    expect(text).not.toMatch(/01[0-9]{9}/);
  });

  test('58mm and 80mm widths never overflow', () => {
    for (const w of [58, 80] as const) {
      const lines = wrapForWidth(buildReceiptText(demo, DEFAULT_PRINTER_CONFIG, w), w);
      expect(assertFits(lines, w)).toEqual([]);
      expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(LINE_WIDTH[w]);
    }
  });

  test('row() helper stays within width', () => {
    expect(row('الإجمالي النهائي:', '770.00 ج.م', 58).length).toBeLessThanOrEqual(LINE_WIDTH[58]);
    expect(row('الإجمالي النهائي:', '770.00 ج.م', 80).length).toBeLessThanOrEqual(LINE_WIDTH[80]);
  });

  test('test print contains Arabic + numbers + width', () => {
    for (const w of [58, 80] as const) {
      const t = buildTestPrint(w).join('\n');
      expect(t).toContain('اختبار اللغة العربية');
      expect(t).toContain('1234567890');
      expect(t).toContain(`${w}mm`);
    }
  });

  test('orderToReceipt copies authoritative totals verbatim', () => {
    const order = {
      orderNumber: 7, createdAt: '2026-09-06T13:30:00.000Z',
      createdBy: { username: 'cashier' }, customer: { name: 'عميل نقدي' }, orderType: 'PICKUP',
      items: [{ productNameSnapshot: 'سكر', quantity: 2, unitPriceSnapshot: 35, lineTotal: 70 }],
      totalItems: 1, subtotal: 70, discount: 0, tax: 0, total: 70,
    };
    const r = orderToReceipt(order, true);
    expect(r.invoiceNumber).toBe('000007');
    expect(r.total).toBe(70);
    expect(r.lines[0].unitPrice).toBe(35);
    expect(r.isCopy).toBe(true);
  });
});
