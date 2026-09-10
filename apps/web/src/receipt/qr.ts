import QRCode from 'qrcode';

/** §1 — async data-URL for a QR code (used by preview + browser print). */
export async function qrDataUrl(text: string, size = 96): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

/** Whether a text renderer should attempt QR (non-empty target). */
export function looksLikeQrUrl(text: string): boolean {
  return /^https?:\/\//i.test(text);
}
