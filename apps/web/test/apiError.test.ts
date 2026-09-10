import { describe, test, expect } from 'vitest';
import { apiError, CONNECTION_ERROR, GENERIC_ERROR } from '../src/services/api';

/**
 * Regression guard: the shared error formatter must NEVER leak an
 * order-domain message onto unrelated screens (Login showed
 * 'حدث خطأ أثناء حفظ الطلب' whenever a login failure carried no
 * backend message body).
 */
describe('apiError', () => {
  test('passes backend string messages through', () => {
    expect(apiError({ response: { data: { message: 'اسم المستخدم أو كلمة المرور غير صحيحة' } } }))
      .toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
  });

  test('joins backend array messages', () => {
    expect(apiError({ response: { data: { message: ['a', 'b'] } } })).toBe('a، b');
  });

  test('no response (offline/CORS/timeout) -> connection message, never order text', () => {
    expect(apiError({})).toBe(CONNECTION_ERROR);
    expect(apiError({ request: {} })).toBe(CONNECTION_ERROR);
    expect(apiError({})).not.toContain('حفظ الطلب');
  });

  test('response without message -> caller fallback (default neutral, never order text)', () => {
    // Gateway/proxy HTML error pages: body is a string, no .message.
    expect(apiError({ response: { status: 502, data: '<html>Bad Gateway</html>' } }))
      .toBe(GENERIC_ERROR);
    expect(apiError({ response: { status: 404, data: '' } }, 'حدث خطأ أثناء تسجيل الدخول'))
      .toBe('حدث خطأ أثناء تسجيل الدخول');
    expect(apiError({ response: { status: 500, data: {} } })).not.toContain('حفظ الطلب');
  });

  test('blank backend message falls back instead of rendering empty', () => {
    expect(apiError({ response: { status: 500, data: { message: '   ' } } }, 'FB')).toBe('FB');
  });
});
