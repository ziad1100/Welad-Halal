import { describe, test, expect } from 'vitest';
import { resolveLoginError } from '../src/utils/loginErrors';

/** Behavior contract of the rebuilt login page: every failure class maps to
 * exactly one Arabic message, and order-domain text never appears here. */
describe('resolveLoginError', () => {
  test('429 → lockout message', () => {
    expect(resolveLoginError({ response: { status: 429, data: {} } })).toContain('محاولات كثيرة');
  });
  test('401 → backend message or credentials fallback', () => {
    expect(resolveLoginError({ response: { status: 401, data: { message: 'X' } } })).toBe('X');
    expect(resolveLoginError({ response: { status: 401, data: {} } })).toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
  });
  test('no response → connection message', () => {
    expect(resolveLoginError({})).toBe('تعذر الاتصال بالخادم، حاول مرة أخرى');
  });
  test('404/5xx → server message, never order text', () => {
    expect(resolveLoginError({ response: { status: 404, data: {} } })).toBe('حدث خطأ في الخادم، حاول مرة أخرى');
    expect(resolveLoginError({ response: { status: 500, data: {} } })).toBe('حدث خطأ في الخادم، حاول مرة أخرى');
    expect(resolveLoginError({ response: { status: 500, data: {} } })).not.toContain('حفظ الطلب');
  });
  test('other errors → generic login message', () => {
    expect(resolveLoginError({ response: { status: 400, data: {} } })).toBe('حدث خطأ أثناء تسجيل الدخول');
  });
});
