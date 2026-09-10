/** Egyptian mobile numbers only: 010/011/012/015 + exactly 11 digits.
 * Mirrors backend apps/backend/src/common/egyptian-phone.ts (backend is authoritative). */
export const EGYPTIAN_PHONE_RE = /^01[0125][0-9]{8}$/;

export function isEgyptianPhone(v: unknown): boolean {
  return typeof v === 'string' && EGYPTIAN_PHONE_RE.test(v.trim());
}

export const EGYPTIAN_PHONE_MSG = 'رقم الهاتف يجب أن يكون رقماً مصرياً صحيحاً (010/011/012/015، 11 رقماً)';

/** Empty is allowed (phone optional); non-empty must be a valid EG mobile. */
export function validateOptionalPhone(v: unknown): string | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  return isEgyptianPhone(v) ? null : EGYPTIAN_PHONE_MSG;
}
