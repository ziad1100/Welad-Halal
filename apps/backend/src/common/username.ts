/**
 * Username normalization (Welad Halal: plain name-based identifiers, no email):
 * NFC + strip invisible directional/zero-width chars + trim ends +
 * collapse any internal whitespace run to a single space,
 * so "احمد  الصياد" and "احمد الصياد" are the same account.
 * Applied to BOTH the stored value (seed/create) and the login lookup,
 * otherwise visually identical Arabic strings fail strict equality.
 */
export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u200E\u200F\u061C\u200B\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}
