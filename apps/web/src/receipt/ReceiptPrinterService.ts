import type { PrinterConfig, PrintStatus, ReceiptData } from './types';
import { loadPrinterConfig } from './configStore';
import { buildReceiptText, buildTestPrint } from './ReceiptTemplate';
import { wrapStyled } from './ReceiptRenderer';
import { renderReceiptRaster, needsRaster } from './ArabicRaster';
import { qrDataUrl } from './qr';
import { BrowserPrintTransport, type Transport } from './transports';

export const PRINT_ERROR_AR =
  'تعذر طباعة الفاتورة. يرجى التأكد من: - تشغيل الطابعة - وجود الورق - اتصال الطابعة بالكمبيوتر - اختيار الطابعة الصحيحة';

// §1 — store phone is a system setting; receipts read it from the public
// settings endpoint (no auth needed) with a light in-memory cache.
let phoneCache: { value: string; at: number } | null = null;
export async function fetchStorePhone(): Promise<string> {
  if (phoneCache && Date.now() - phoneCache.at < 60_000) return phoneCache.value;
  try {
    const baseURL = (import.meta as any).env?.VITE_API_URL || '/api';
    const res = await fetch(`${baseURL}/settings/public`, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const json = (await res.json()) as any;
      const phone = String(json?.store_phone || '').trim();
      phoneCache = { value: phone, at: Date.now() };
      return phone;
    }
  } catch { /* offline → no phone line */ }
  return phoneCache?.value ?? '';
}
export function resetPhoneCache() { phoneCache = null; }

function log(...a: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[PRINT]', ...a);
}

/**
 * UI → ReceiptPrinterService → Transport → printer.
 * Never called with cart data — only finalized ReceiptData (see orderToReceipt).
 * Print failures never reject the sale; they report status for retry/print-later.
 */
class Service {
  status: PrintStatus = 'idle';
  lastError = '';
  private transport: Transport = new BrowserPrintTransport();
  private listeners = new Set<(s: PrintStatus) => void>();

  setTransport(t: Transport) { this.transport = t; }
  onChange(fn: (s: PrintStatus) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((f) => f(this.status)); }

  private render(r: ReceiptData, cfg: PrinterConfig) {
    const logical = buildReceiptText(r, cfg, cfg.paperWidth);
    const lines = wrapStyled(logical, cfg.paperWidth);
    const plain = lines.map((l) => l.text);
    const raster = needsRaster(plain) ? renderReceiptRaster(plain, cfg.paperWidth).dataUrl : undefined;
    return { lines, raster };
  }

  async printReceipt(r: ReceiptData, cfg?: PrinterConfig): Promise<boolean> {
    if (this.status === 'printing') return false; // single-flight: no double-print
    const c = cfg || loadPrinterConfig();
    // §1 — resolve the store contact line from the public settings endpoint.
    const withContact = r.storePhone ? r : { ...r, storePhone: r.storePhone || (await fetchStorePhone()) || undefined };
    this.status = 'printing'; this.lastError = ''; this.emit();
    log(`Printing invoice #${r.invoiceNumber}`, `Paper width: ${c.paperWidth}mm`, r.isCopy ? '(copy)' : '(original)', r.isReturn ? '(return)' : '');
    try {
      const { lines, raster } = this.render(withContact, c);
      // §1 — QR graphics for any qr-marked line (public order URL).
      const qrDataUrls = await Promise.all(
        lines.map(async (l) => (l.style?.qr && l.style.qrUrl ? await qrDataUrl(l.style.qrUrl) : undefined)),
      );
      await this.transport.print({ lines, qrDataUrls, rasterDataUrl: raster, cut: true }, c);
      this.status = 'success';
      log('Print successful');
      return true;
    } catch (e: any) {
      this.status = 'failed';
      this.lastError = e?.message === 'blocked' ? 'تم حظر نافذة المعاينة — اسمح بالنوافذ المنبثقة' : PRINT_ERROR_AR;
      log('Print failed', e?.message || e);
      return false;
    } finally { this.emit(); }
  }

  async testPrint(cfg?: PrinterConfig): Promise<boolean> {
    if (this.status === 'printing') return false;
    const c = cfg || loadPrinterConfig();
    this.status = 'printing'; this.lastError = ''; this.emit();
    log('Printer selected', c.printerName || '(browser default)', `Paper width: ${c.paperWidth}mm`);
    try {
      const lines = wrapStyled(buildTestPrint(c.paperWidth), c.paperWidth);
      await this.transport.print({ lines, cut: true }, c); // never kicks the drawer
      this.status = 'success';
      log('Print successful');
      return true;
    } catch {
      this.status = 'failed'; this.lastError = PRINT_ERROR_AR;
      log('Print failed');
      return false;
    } finally { this.emit(); }
  }

  async kickDrawer(cfg?: PrinterConfig): Promise<boolean> {
    const c = cfg || loadPrinterConfig();
    try {
      await this.transport.openDrawer(c);
      // eslint-disable-next-line no-console
      console.log('[DRAWER] Cash drawer command sent');
      return true;
    } catch {
      return false; // drawer unsupported in browser — Electron transport implements it
    }
  }

  reset() { this.status = 'idle'; this.lastError = ''; this.emit(); }
}

export const ReceiptPrinterService = new Service();
