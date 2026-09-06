import { LINE_WIDTH } from './ReceiptTemplate';
import type { PaperWidth } from './types';

/**
 * Arabic raster fallback: render receipt lines to a monochrome canvas so
 * shaping/RTL is handled by the browser engine, then threshold to 1-bit
 * columns for ESC/POS raster (GS v 0). Printers that can't shape Arabic
 * natively print this image instead of broken text.
 */
export function renderReceiptRaster(lines: string[], width: PaperWidth): { dataUrl: string; darkPixels: number } {
  const dotsPerLine = width === 58 ? 384 : 576;
  const fontPx = 24;
  const lineH = 32;
  const canvas = document.createElement('canvas');
  canvas.width = dotsPerLine;
  canvas.height = Math.max(lineH, lines.length * lineH + 16);
  canvas.dir = 'rtl';
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.font = `${fontPx}px Tahoma, "Segoe UI", Arial`;
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  lines.forEach((ln, i) => ctx.fillText(ln, dotsPerLine / 2, 24 + i * lineH));
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let dark = 0;
  for (let p = 0; p < img.data.length; p += 4) {
    if (img.data[p] < 128) dark++;
  }
  return { dataUrl: canvas.toDataURL('image/png'), darkPixels: dark };
}

export function needsRaster(lines: string[]): boolean {
  return lines.some((l) => /[\u0600-\u06FF]/.test(l));
}

export { LINE_WIDTH };
