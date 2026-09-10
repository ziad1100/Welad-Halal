import { LINE_WIDTH } from './ReceiptTemplate';
import type { StyledLine } from './ReceiptTemplate';
import type { PaperWidth } from './types';

/**
 * Wrap logical lines to the printable width. Latin segments wrap on spaces;
 * Arabic shaped text is kept whole per line and truncated only past the cap
 * (thermal raster path renders shaping correctly — see ArabicRaster).
 */
export function wrapForWidth(lines: string[], width: PaperWidth): string[] {
  const w = LINE_WIDTH[width];
  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= w) { out.push(line); continue; }
    if (/^[\x00-\x7F\s×.]*$/.test(line)) {
      let cur = '';
      for (const word of line.split(' ')) {
        if ((cur + ' ' + word).trim().length > w) { out.push(cur.trim()); cur = word; }
        else cur = (cur + ' ' + word).trim();
      }
      if (cur) out.push(cur);
    } else {
      out.push(line.slice(0, w));
    }
  }
  return out;
}

/** Assert no line overflows — used by tests for both widths. */
export function assertFits(lines: string[], width: PaperWidth): string[] {
  return wrapForWidth(lines, width).filter((l) => l.length > LINE_WIDTH[width]);
}

/** Wrap styled receipt lines, preserving each line's style across wrapped segments. */
export function wrapStyled(lines: StyledLine[], width: PaperWidth): StyledLine[] {
  const out: StyledLine[] = [];
  for (const line of lines) {
    const wrapped = wrapForWidth([line.text], width);
    wrapped.forEach((text, i) => out.push({ text, style: i === 0 ? line.style : { ...line.style, align: 'start' } }));
  }
  return out;
}
