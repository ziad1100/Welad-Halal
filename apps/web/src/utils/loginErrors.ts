import { apiError } from '../services/api';

/* ------------------------------------------------------------------ */
/* Login message catalog + error mapper (Arabic UI — exact strings are  */
/* contractual: e2e specs and hardened error mapping depend on them).  */
/* Kept outside the component file (react-refresh rule).               */
/* ------------------------------------------------------------------ */
export const LOGIN_MSG = {
  missingCredentials: 'أدخل اسم المستخدم وكلمة المرور',
  rateLimited: 'محاولات كثيرة — الحساب مقفل مؤقتاً، حاول بعد قليل',
  invalidCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحة',
  connectionFailed: 'تعذر الاتصال بالخادم، حاول مرة أخرى',
  serverError: 'حدث خطأ في الخادم، حاول مرة أخرى',
  loginFailed: 'حدث خطأ أثناء تسجيل الدخول',
  passwordChangeFailed: 'حدث خطأ أثناء تغيير كلمة المرور',
  passwordTooShort: 'كلمة المرور قصيرة (4 أحرف على الأقل)',
  passwordMismatch: 'تأكيد كلمة المرور غير متطابق',
} as const;

interface HttpFailure {
  response?: { status?: unknown; data?: { message?: unknown } };
}

function asFailure(e: unknown): HttpFailure {
  return (typeof e === 'object' && e !== null ? (e as HttpFailure) : {});
}

function backendMessage(e: unknown): string | null {
  const msg = asFailure(e).response?.data?.message;
  return typeof msg === 'string' && msg.trim() ? msg : null;
}

/** Map any login failure to the correct Arabic message.
 *  429 → lockout · 401 → backend message or credentials fallback ·
 *  offline → connection · 404/5xx → server message (never order-domain). */
export function resolveLoginError(e: unknown): string {
  const status = asFailure(e).response?.status;
  if (status === 429) return LOGIN_MSG.rateLimited;
  if (status === 401) return backendMessage(e) ?? LOGIN_MSG.invalidCredentials;
  if (asFailure(e).response == null) return LOGIN_MSG.connectionFailed;
  if (status === 404 || (typeof status === 'number' && status >= 500)) {
    const msg = backendMessage(e);
    return msg && !/^cannot (get|post|put|patch|delete) /i.test(msg) ? msg : LOGIN_MSG.serverError;
  }
  return apiError(e, LOGIN_MSG.loginFailed);
}
