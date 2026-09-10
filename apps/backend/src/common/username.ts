/**
 * Username normalization (Welad Halal: plain name-based identifiers, no email):
 * NFC + strip invisible directional/zero-width chars + trim ends +
 * collapse any internal whitespace run to a single space,
 * so "احمد  الصياد" and "احمد الصياد" are the same account.
 * Applied to BOTH the stored value (seed/create) and the login lookup,
 * otherwise visually identical Arabic strings fail strict equality.
 *
 * Alef-hamza spelling (H2 login trap: "أحمد" vs "احمد") is handled WITHOUT
 * changing this canonical form (byte-stable for all existing rows) — see
 * foldArabicAlef, used as a login fallback and duplicate guard.
 */
export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u200E\u200F\u061C\u200B\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Fold Arabic alef orthographic variants (أإآٱ → ا). Same name, different
 * spelling only — other letters are never merged. Lossy: used for lookup
 * fallback and duplicate detection, never as the stored canonical form. */
export function foldArabicAlef(s: string): string {
  return s.replace(/[أإآٱ]/g, 'ا');
}
