import { useState } from 'react';
import { useAuth, ROLE_AR } from '../../store/auth';
import { getTheme, toggleTheme, type Theme } from '../../store/theme';

const MENUS = ['ملف', 'المبيعات', 'المشتريات', 'الموردون والعملاء', 'التصنيع', 'المخزن', 'تقارير العمل', 'شؤون الموظفين', 'أدوات', 'الإدارة', 'مساعدة'];

export function TopMenuBar({ onNav }: { onNav: (k: string) => void }) {
  return (
    <div className="kmenu" dir="rtl">
      {MENUS.map((m) => (
        <span key={m} onClick={() => onNav(m)}>{m}</span>
      ))}
    </div>
  );
}

export function HeaderBar() {
  const { user } = useAuth();
  const now = new Date();
  const date = now.toLocaleDateString('ar-EG');
  const time = now.toLocaleTimeString('ar-EG');
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--k-header-bg)', borderBottom: '1px solid var(--k-border)', padding: '4px 8px' }} dir="rtl">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', color: 'var(--k-logo-navy)' }}><span style={{ color: 'var(--k-logo-orange)' }}>Welad Halal</span> — نظام إدارة الطلبات <small>نسخة محدثة</small></span>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <span>المستخدم: <b>{user?.fullName || user?.username || '—'}</b> {user && <span className="role-badge">{ROLE_AR[user.role]}</span>}</span>
        <span>التاريخ: {date}</span>
        <span>الوقت: {time}</span>
      </div>
    </div>
  );
}

export function Toolbar({ onRefresh, onPrint, onUsers, onLock, onLogout }: any) {
  const [theme, setTheme] = useState<Theme>(() => getTheme());
  function flip() { setTheme(toggleTheme()); }
  return (
    <div className="ktoolbar" dir="rtl">
      <button className="kbtn" onClick={onRefresh} title="تحديث">⟳ تحديث</button>
      <button className="kbtn" onClick={onPrint} title="طباعة">🖨 طباعة</button>
      <button className="kbtn" title="تنبيه">⏰</button>
      <button className="kbtn" onClick={onUsers} title="المستخدمون">👥</button>
      <button className="kbtn" title="تقويم">📅</button>
      <button className="kbtn" onClick={onLock} title="قفل">🔒 قفل</button>
      <button className="kbtn" onClick={flip} title={theme === 'dark' ? 'وضع نهاري' : 'وضع ليلي'}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      <span style={{ flex: 1 }} />
      <button className="kbtn" onClick={onLogout}>خروج</button>
    </div>
  );
}
