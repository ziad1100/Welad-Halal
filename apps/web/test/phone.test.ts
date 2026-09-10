import { describe, test, expect } from 'vitest';
import { isEgyptianPhone, validateOptionalPhone } from '../src/utils/phone';

describe('Egyptian phone validation', () => {
  test('valid EG mobiles pass', () => {
    for (const p of ['01012345678', '01112345678', '01212345678', '01512345678']) {
      expect(isEgyptianPhone(p)).toBe(true);
      expect(validateOptionalPhone(p)).toBeNull();
    }
  });
  test('invalid numbers fail', () => {
    for (const p of ['123', '02012345678', '0101234567', '010123456789', '+201012345678', '01a12345678', ' 01312345678 ']) {
      expect(isEgyptianPhone(p)).toBe(false);
      expect(validateOptionalPhone(p)).not.toBeNull();
    }
  });
  test('empty stays optional', () => {
    expect(validateOptionalPhone('')).toBeNull();
    expect(validateOptionalPhone(undefined)).toBeNull();
  });
});
