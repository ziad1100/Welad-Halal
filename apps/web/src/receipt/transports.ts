import type { PrinterConfig } from './types';

export interface PrintJob {
  lines: string[];
  rasterDataUrl?: string;
  cut?: boolean;
  openDrawer?: boolean;
}

export interface Transport {
  readonly kind: string;
  listPrinters(): Promise<string[]>;
  print(job: PrintJob, cfg: PrinterConfig): Promise<void>;
  openDrawer(cfg: PrinterConfig): Promise<void>;
}

/** Browser transport: print-preview window (works today, no hardware needed). */
export class BrowserPrintTransport implements Transport {
  readonly kind = 'browser';
  async listPrinters(): Promise<string[]> {
    return []; // OS discovery requires Electron/Node — see NodeThermalTransport
  }
  async print(job: PrintJob): Promise<void> {
    const w = window.open('', '_blank', 'width=400,height=700');
    if (!w) throw new Error('blocked');
    const body = job.lines.map((l) => `<div>${escapeHtml(l) || '&nbsp;'}</div>`).join('');
    w.document.write(`<html dir="rtl"><head><title>معاينة الفاتورة</title><style>body{font-family:Tahoma;width:280px;margin:8px auto;font-size:13px}div{white-space:pre-wrap;text-align:center}</style></head><body>${body}<script>onload=()=>{print();}<\/script></body></html>`);
    w.document.close();
  }
  async openDrawer(): Promise<void> {
    throw new Error('drawer-unsupported');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Electron/Node transport seam: implemented in apps/desktop via
 * node-thermal-printer (ESC/POS, raster Arabic, cutter, drawer kick).
 * Kept as an interface here so UI/services never change when it lands.
 */
export class NodeThermalTransport implements Transport {
  readonly kind = 'node-thermal';
  async listPrinters(): Promise<string[]> {
    throw new Error('electron-only');
  }
  async print(): Promise<void> {
    throw new Error('electron-only');
  }
  async openDrawer(): Promise<void> {
    throw new Error('electron-only');
  }
}
