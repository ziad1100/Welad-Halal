import { useAuth } from '../../store/auth';

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
        <span style={{ fontWeight: 'bold', color: 'var(--k-logo-navy)' }}><span style={{ color: 'var(--k-logo-orange)' }}>KStore</span> — نظام إدارة الطلبات <small>نسخة محدثة</small></span>
        <span style={{ fontSize: 11 }}>3B Smart Solutions</span>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <span>المستخدم: <b>{user?.name || user?.username || '—'}</b> ({user?.role})</span>
        <span>التاريخ: {date}</span>
        <span>الوقت: {time}</span>
      </div>
    </div>
  );
}

export function Toolbar({ onRefresh, onPrint, onUsers, onLock, onLogout }: any) {
  return (
    <div className="ktoolbar" dir="rtl">
      <button className="kbtn" onClick={onRefresh} title="تحديث">⟳ تحديث</button>
      <button className="kbtn" onClick={onPrint} title="طباعة">🖨 طباعة</button>
      <button className="kbtn" title="تنبيه">⏰</button>
      <button className="kbtn" onClick={onUsers} title="المستخدمون">👥</button>
      <button className="kbtn" title="تقويم">📅</button>
      <button className="kbtn" onClick={onLock} title="قفل">🔒 قفل</button>
      <span style={{ flex: 1 }} />
      <button className="kbtn" onClick={onLogout}>خروج</button>
    </div>
  );
}
