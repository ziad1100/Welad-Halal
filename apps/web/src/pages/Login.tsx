import { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../store/auth';

export function LoginPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('cashier');
  const [password, setPassword] = useState('cashier123');
  const [err, setErr] = useState('');
  const { login } = useAuth();

  async function submit(e: any) {
    e.preventDefault();
    setErr('');
    try {
      const { data } = await api.post('/auth/login', { username, password });
      login(data.user, data.token);
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'بيانات الدخول غير صحيحة');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--k-bg)' }} dir="rtl">
      <form onSubmit={submit} className="kpanel" style={{ width: 320 }}>
        <h3 style={{ margin: '0 0 8px' }}><span style={{ color: 'var(--k-logo-orange)' }}>KStore</span> — تسجيل الدخول</h3>
        {err && <div className="kerr">{err}</div>}
        <div className="krow"><span className="klabel">المستخدم</span><input className="kinput" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div className="krow"><span className="klabel">كلمة المرور</span><input className="kinput" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="kbtn kbtn-primary" type="submit" style={{ width: '100%' }}>دخول</button>
        <div style={{ fontSize: 11, marginTop: 6 }}>تجريبي: admin/admin123 — manager/manager123 — cashier/cashier123</div>
      </form>
    </div>
  );
}
