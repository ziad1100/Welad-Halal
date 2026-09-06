import type { PrinterConfig } from './types';
import { DEFAULT_PRINTER_CONFIG } from './types';

const KEY = 'kstore_printer_config';

export function loadPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) };
  } catch { /* corrupted config → defaults */ }
  return { ...DEFAULT_PRINTER_CONFIG };
}

export function savePrinterConfig(cfg: PrinterConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}
