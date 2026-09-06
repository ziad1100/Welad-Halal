import { useState } from 'react';
import { api, apiError } from '../services/api';
import { useAuth, ROLE_AR } from '../store/auth';

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
          <h1><span>KStore</span></h1>
          <p style={{ fontSize: 16, fontWeight: 700 }}>نظام إدارة الطلبات — نسخة محدثة</p>
          <p>نقاط البيع · المخزون · التقارير</p>
          <p style={{ fontSize: 11, opacity: .7 }}>3B Smart Solutions</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <h2>تسجيل الدخول</h2>
          {err && <div className="kerr">{err}</div>}
          {fieldErr && <div className="kerr">{fieldErr}</div>}
          <div className="krow"><span className="klabel">المستخدم</span>
            <input className="kinput" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" style={{ flex: 1 }} /></div>
          <div className="krow"><span className="klabel">كلمة المرور</span>
            <span className="pw-wrap">
              <input className="kinput" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)} title={showPw ? 'إخفاء' : 'إظهار'}>{showPw ? '🙈' : '👁'}</button>
            </span></div>
          <button className="kbtn kbtn-primary" type="submit" disabled={busy} style={{ padding: '9px', fontSize: 14 }}>
            {busy ? <span className="spinner" /> : 'دخول'}
          </button>
          {DEV && <div style={{ fontSize: 11, color: 'var(--muted)' }}>تجريبي (وضع التطوير فقط): admin/admin123 — manager/manager123 — cashier/cashier123</div>}
        </form>
      </div>
    </div>
  );
}

export function RoleBadge({ role }: { role: keyof typeof ROLE_AR }) {
  return <span className="role-badge">{ROLE_AR[role] || role}</span>;
}
