import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth, ROLE_AR } from '../../store/auth';
import { getTheme, toggleTheme, type Theme } from '../../store/theme';
import { useLang } from '../../store/lang';
import { useSettings } from '../../store/settings';
import { AlertsBell } from '../alerts/AlertsBell';
import { useAlerts } from '../../store/alerts';

export function TopMenuBar({ onNav }: { onNav: (k: string) => void }) {
  const { t } = useTranslation();
  const MENUS = ['file', 'sales', 'purchases', 'suppliers', 'manufacturing', 'warehouse', 'stocktake', 'workReports', 'staff', 'tools', 'admin', 'help'];
  return (
    <div className="kmenu">
      {MENUS.map((k) => (
        <span key={k} onClick={() => onNav(k)} title={t(k)}>{t(k)}</span>
      ))}
    </div>
  );
}

export function HeaderBar() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { lang, set } = useLang();
  const { acceptingOrders, loadPublic } = useSettings();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id); }, []);
  useEffect(() => { void loadPublic(); }, [loadPublic]);

  return (
    <div className="header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--k-header-bg)', borderBottom: '1px solid var(--k-border)', padding: '4px 8px' }} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', color: 'var(--k-logo-navy)' }}><span style={{ color: 'var(--k-logo-orange)' }}>Welad Halal</span> — {t('brand')} <small>{t('version')}</small></span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {user && user.permissionLevel >= 50 && (
          <span title={t('store')} className={acceptingOrders ? 'kstatus' : 'kstatus'} style={acceptingOrders ? {} : { background: '#E5484D', color: '#fff', borderColor: '#E5484D' }}>
            {acceptingOrders ? `🟢 ${t('open')}` : `🔴 ${t('closed')}`}
          </span>
        )}
        <AlertsBell />
        <span>{t('user')}: <b>{user?.fullName || user?.username || '—'}</b> {user && <span className="role-badge">{ROLE_AR[user.role]}</span>}</span>
        <span>{t('date')}: {now.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</span>
        <span>{t('time')}: {now.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</span>
        <button className="kbtn" title={t('language')} onClick={() => set(lang === 'ar' ? 'en' : 'ar')}>
          {lang === 'ar' ? 'EN' : 'عربي'}
        </button>
      </div>
    </div>
  );
}

export function Toolbar({ onRefresh, onPrint, onUsers, onLock, onLogout }: any) {
  const [theme, setTheme] = useState<Theme>(() => getTheme());
  const { t } = useTranslation();
  const { user } = useAuth();
  function flip() { setTheme(toggleTheme()); }
  // §3 — keep the alert store warm for manager/owner sessions (socket + poll).
  useEffect(() => {
    if (user && user.permissionLevel >= 50) {
      const token = localStorage.getItem('kstore_token') || '';
      useAlerts.getState().init(user.permissionLevel, token);
    }
  }, [user]);
  return (
    <div className="ktoolbar" dir={document.documentElement.getAttribute('dir') === 'ltr' ? 'ltr' : 'rtl'}>
      <button className="kbtn" onClick={onRefresh} title={t('refresh')} style={{ background: '#DBEAFE', borderColor: '#93C5FD' }}>⟳ {t('refresh')}</button>
      <button className="kbtn" onClick={onPrint} title={t('print')} style={{ background: '#DFF5E3', borderColor: '#86D99A' }}>🖨 {t('print')}</button>
      <button className="kbtn" title={t('alerts')} style={{ background: '#FEF3C7', borderColor: '#F5C518' }}>⏰</button>
      <button className="kbtn" onClick={onUsers} title={t('users')} style={{ background: '#EDE9FE', borderColor: '#B7A6F5' }}>👥</button>
      <button className="kbtn" title={t('calendar')} style={{ background: '#CCFBF1', borderColor: '#5EEAD4' }}>📅</button>
      <button className="kbtn" onClick={onLock} title={t('lock')} style={{ background: '#E5E7EB', borderColor: '#9CA3AF' }}>🔒 {t('lock')}</button>
      <button className="kbtn" onClick={flip} title={t('theme')} style={{ background: '#F3E8FF', borderColor: '#C084FC' }}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      <span style={{ flex: 1 }} />
      <button className="kbtn" onClick={onLogout} style={{ background: '#FDE8E8', borderColor: '#F19494' }}>{t('logout')}</button>
    </div>
  );
}
