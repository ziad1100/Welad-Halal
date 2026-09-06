import type { PrinterConfig, PrintStatus, ReceiptData } from './types';
import { loadPrinterConfig } from './configStore';
import { buildReceiptText, buildTestPrint } from './ReceiptTemplate';
import { wrapForWidth } from './ReceiptRenderer';
import { renderReceiptRaster, needsRaster } from './ArabicRaster';
import { BrowserPrintTransport, type Transport } from './transports';

export const PRINT_ERROR_AR =
  'تعذر طباعة الفاتورة. يرجى التأكد من: - تشغيل الطابعة - وجود الورق - اتصال الطابعة بالكمبيوتر - اختيار الطابعة الصحيحة';

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
    const lines = wrapForWidth(logical, cfg.paperWidth);
    const raster = needsRaster(lines) ? renderReceiptRaster(lines, cfg.paperWidth).dataUrl : undefined;
    return { lines, raster };
  }

  async printReceipt(r: ReceiptData, cfg?: PrinterConfig): Promise<boolean> {
    if (this.status === 'printing') return false; // single-flight: no double-print
    const c = cfg || loadPrinterConfig();
    this.status = 'printing'; this.lastError = ''; this.emit();
    log(`Printing invoice #${r.invoiceNumber}`, `Paper width: ${c.paperWidth}mm`, r.isCopy ? '(copy)' : '(original)');
    try {
      const { lines, raster } = this.render(r, c);
      await this.transport.print({ lines, rasterDataUrl: raster, cut: true }, c);
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
      const lines = wrapForWidth(buildTestPrint(c.paperWidth), c.paperWidth);
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
