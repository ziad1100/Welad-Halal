import { type StyledLine } from './ReceiptTemplate';
import type { PaperWidth } from './types';

/**
 * ESC/POS command generator: turns the same logical receipt lines into a raw
 * printer byte stream (align/bold/size + text + cut), mirroring the on-screen
 * template 1:1 so hardware output matches the preview. Thermal printers render
 * command streams, not HTML — sizes come from GS! n commands, alignment from
 * ESC a n, emphasis from ESC E n.
 */

const ESC = 0x1b;
const GS = 0x1d;

type Size = NonNullable<NonNullable<StyledLine['style']>['size']>;

/** Size map: xl = 2x2 (store name), lg = double height only (grand total), rest = Font A. */
function sizeBytes(size: Size | undefined): [number, number] {
  switch (size) {
    case 'xl': return [0x11, 0x11]; // double width + double height
    case 'lg': return [0x00, 0x11]; // double height — total must stay within paper width
    default: return [0x00, 0x00];
  }
}

/**
 * Encode receipt lines to ESC/POS bytes. Arabic shaping is the printer's job
 * on this native-codepage path; printers that can't shape Arabic use the
 * raster path in ArabicRaster.ts instead — same lines either way.
 */
export function buildEscPos(lines: StyledLine[], _width: PaperWidth): Uint8Array {
  const bytes: number[] = [];
  bytes.push(ESC, 0x40); // initialize printer
  for (const line of lines) {
    const st = line.style || {};
    const [w, h] = sizeBytes(st.size);
    if (w !== 0x00 || h !== 0x00) bytes.push(GS, 0x21, w | (h << 4));
    if (st.bold) bytes.push(ESC, 0x45, 0x01);
    bytes.push(ESC, 0x61, st.align === 'center' ? 0x01 : 0x00);
    for (const ch of line.text) {
      const c = ch.codePointAt(0)!;
      if (c < 128) bytes.push(c);
      else bytes.push(0x3f); // '?' — non-ASCII prints via the raster path in production
    }
    bytes.push(0x0a); // LF
    if (st.bold) bytes.push(ESC, 0x45, 0x00);
    if (w !== 0x00 || h !== 0x00) bytes.push(GS, 0x21, 0x00);
  }
  bytes.push(ESC, 0x64, 0x02); // feed 2 lines then full cut
  return new Uint8Array(bytes);
}

/**
 * Byte view for the Electron/NodeThermalTransport seam — the raw stream is
 * written to the printer socket as-is (Buffer.from(u8.buffer) there).
 */
export function escPosBytes(lines: StyledLine[], width: PaperWidth): Uint8Array {
  return buildEscPos(lines, width);
}
