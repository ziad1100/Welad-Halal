import { useState } from 'react';
import { api, apiError } from '../services/api';
import { useAuth, ROLE_AR, type RoleName } from '../store/auth';

const DEV = (import.meta as any).env?.DEV;

export function LoginPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState(DEV ? 'cashier' : '');
  const [password, setPassword] = useState(DEV ? 'cashier123' : '');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState('');
  const { login } = useAuth();

  async function submit(e: any) {
    e.preventDefault();
    if (!username.trim() || !password) { setFieldErr('أدخل اسم المستخدم وكلمة المرور'); return; }
    setFieldErr(''); setErr(''); setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { username: username.trim(), password });
      login(data.user, data.token);
      onDone();
    } catch (e: any) {
      const status = e?.response?.status;
      setErr(status === 429 ? 'محاولات كثيرة — الحساب مقفل مؤقتاً، حاول بعد قليل' : apiError(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap" dir="rtl">
      <div className="login-card">
        <div className="login-brand">
          <h1><span>Welad Halal</span></h1>
          <p style={{ fontSize: 16, fontWeight: 700 }}>ولاد حلال — نظام إدارة الطلبات</p>
          <p>نقاط البيع · المخزون · التقارير</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <h2>تسجيل الدخول</h2>
          {err && <div className="kerr">{err}</div>}
          {fieldErr && <div className="kerr">{fieldErr}</div>}
          <div className="krow"><span className="klabel">المستخدم</span>
            <input data-testid="login-username" className="kinput" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" style={{ flex: 1 }} /></div>
          <div className="krow"><span className="klabel">كلمة المرور</span>
            <span className="pw-wrap">
              <input data-testid="login-password" className="kinput" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)} title={showPw ? 'إخفاء' : 'إظهار'}>{showPw ? '🙈' : '👁'}</button>
            </span></div>
          <button data-testid="login-submit" className="kbtn kbtn-primary" type="submit" disabled={busy} style={{ padding: '9px', fontSize: 14 }}>
            {busy ? <span className="spinner" /> : 'دخول'}
          </button>
          {DEV && <div style={{ fontSize: 11, color: 'var(--muted)' }}>تجريبي (وضع التطوير فقط): owner@weladhalal.pos — admin/admin123 — cashier/cashier123</div>}
        </form>
      </div>
    </div>
  );
}

export function RoleBadge({ role }: { role: RoleName }) {
  return <span className="role-badge">{ROLE_AR[role] || role}</span>;
}

/** Blocking gate: temporary-password accounts must set a new password first. */
export function ForceChangeGate({ onDone }: { onDone: () => void }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();

  async function submit(e: any) {
    e.preventDefault();
    setErr('');
    if (pw1.length < 4) { setErr('كلمة المرور قصيرة (4 أحرف على الأقل)'); return; }
    if (pw1 !== pw2) { setErr('تأكيد كلمة المرور غير متطابق'); return; }
    setBusy(true);
    try {
      await api.patch('/auth/password', { newPassword: pw1 });
      await refresh();
      onDone();
    } catch (e: any) { setErr(apiError(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap" dir="rtl">
      <form className="login-card" style={{ display: 'block', padding: 28, maxWidth: 420 }} onSubmit={submit}>
        <h2>تغيير كلمة المرور المؤقتة</h2>
        <p style={{ color: 'var(--muted)' }}>حسابك يستخدم كلمة مرور مؤقتة — يجب تعيين كلمة مرور جديدة للمتابعة.</p>
        {err && <div className="kerr">{err}</div>}
        <div className="krow"><span className="klabel">الجديدة</span>
          <input data-testid="pw-new" className="kinput" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" style={{ flex: 1 }} /></div>
        <div className="krow"><span className="klabel">التأكيد</span>
          <input data-testid="pw-confirm" className="kinput" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" style={{ flex: 1 }} /></div>
        <button data-testid="pw-submit" className="kbtn kbtn-primary" type="submit" disabled={busy} style={{ width: '100%', padding: 9 }}>حفظ ومتابعة</button>
      </form>
    </div>
  );
}
