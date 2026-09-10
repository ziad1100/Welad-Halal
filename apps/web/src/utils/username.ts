/**
 * Frontend mirror of backend normalizeUsername (apps/backend/src/common/username.ts):
 * NFC + strip invisible directional/zero-width chars + trim + collapse whitespace.
 * Keeps client payload canonical so Arabic usernames arrive exactly as stored (UTF-8 JSON).
 */
export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u200E\u200F\u061C\u200B\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}
