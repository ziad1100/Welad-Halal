import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './styles/kstore.css';
import './i18n/dir.css';
import './i18n/index';
import { useAuth, levelAtLeast, type RoleName } from './store/auth';
import { useCart } from './store/cart';
import { RequireLevel } from './components/shared/ui';
import { TopMenuBar, HeaderBar, Toolbar } from './components/layout/chrome';
import { LoginPage, ForceChangeGate } from './pages/Login';
import { OrdersLogPage } from './pages/OrdersLog';
import { POSPage } from './pages/POS';
import { ProductsPage, InventoryPage, ReportsPage } from './pages/Admin';
import { UserManagementPage } from './pages/Users';
import { PurchasesPage, CategoriesPage, ExpensesPage, AuditPage, PrinterSettingsPage } from './pages/Ops';
import { SuppliersPage, ManufacturingPage, HRPage } from './pages/Erp';
import { StockTakePage } from './pages/StockTake';
import { SettingsPage } from './pages/Settings';
import { ShiftsPage } from './pages/Shifts';
import { DiscountCodesPage } from './pages/DiscountCodes';
import { CustomerDisplayPage } from './pages/CustomerDisplay';
import { PublicOrderPage } from './pages/PublicOrder';
import { MobileApp } from './pages/mobile/App';
import { StoreClosedBanner } from './components/store/StoreClosedBanner';
import { applyLang, getLang, useDir } from './store/lang';
import { useTranslation } from 'react-i18next';

const qc = new QueryClient();

/** Employee shell: ONLY the Cashier screen — no menu, tabs, or toolbar. */
function EmployeeShell({ onLock, onLogout }: { onLock: () => void; onLogout: () => void }) {
  const loc = useLocation();
  const dir = useDir();
  const allowed = loc.pathname === '/' || loc.pathname === '/pos';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <HeaderBar />
      <div style={{ flex: 1, minHeight: 0 }}>
        {allowed ? <POSPage onBack={() => onLock()} /> : (
          <div className="denied" dir={dir}>
            <div className="kerr" style={{ display: 'inline-block' }}>هذا المستخدم غير مصرح له — هذه الصفحة تتطلب صلاحية أعلى.</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: 4, borderTop: '1px solid var(--k-border)' }} dir={dir}>
        <button className="kbtn" onClick={onLock}>قفل</button>
        <button className="kbtn" onClick={onLogout}>خروج</button>
      </div>
    </div>
  );
}

function Shell() {
  const { user, ready, logout, init } = useAuth();
  const { t } = useTranslation();
  const dir = useDir();
  const [locked, setLocked] = useState(false);
  const [pwChanged, setPwChanged] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => { init(); }, [init]);
  // §8 — apply persisted direction on every render where the auth state settles.
  useEffect(() => { applyLang(getLang()); }, [ready]);

  if (!ready) {
    return <div className="login-wrap" dir="rtl"><div className="kpanel">جاري التحقق من الجلسة…</div></div>;
  }

  if (!user || locked) {
    return <LoginPage onDone={() => { setLocked(false); setPwChanged(false); nav('/'); }} />;
  }

  if (user.forcePasswordChange && !pwChanged) {
    return <ForceChangeGate onDone={() => setPwChanged(true)} />;
  }

  const doLogout = () => { logout(); nav('/'); };

  // Part 6: employees route straight into the cashier-only shell.
  if (user.role === 'employee') {
    return <EmployeeShell onLock={() => setLocked(true)} onLogout={doLogout} />;
  }

  function menuNav(m: string) {
    if (m === 'sales') nav('/');
    else if (m === 'purchases') nav('/purchases');
    else if (m === 'warehouse') nav('/inventory');
    else if (m === 'stocktake') nav('/stocktake');
    else if (m === 'suppliers') nav('/suppliers');
    else if (m === 'manufacturing') nav('/manufacturing');
    else if (m === 'workReports') nav('/reports');
    else if (m === 'tools') nav('/audit');
    else if (m === 'staff') nav('/shifts');
    else if (m === 'admin') nav('/settings');
    else if (m === 'file') nav('/');
    else if (m === 'help') nav('/settings');
    else nav('/');
  }

  /** Resume a held order back into the active cashier cart. */
  function resumeOrder(o: any) {
    useCart.getState().loadFromOrder(o);
    nav('/pos');
  }

  const tabs: { to: string; l: string; level: number }[] = [
    { to: '/', l: 'ordersLog', level: 10 },
    { to: '/pos', l: 'newOrder', level: 10 },
    { to: '/products', l: 'products', level: 10 },
    { to: '/categories', l: 'categories', level: 50 },
    { to: '/inventory', l: 'inventory', level: 10 },
    { to: '/stocktake', l: 'stocktake', level: 50 },
    { to: '/purchases', l: 'purchases', level: 50 },
    { to: '/suppliers', l: 'suppliersTab', level: 50 },
    { to: '/manufacturing', l: 'manufacturingTab', level: 50 },
    { to: '/shifts', l: 'shifts', level: 50 },
    { to: '/hr', l: 'hr', level: 100 },
    { to: '/expenses', l: 'expenses', level: 10 },
    { to: '/reports', l: 'reports', level: 50 },
    { to: '/audit', l: 'audit', level: 50 },
    { to: '/discounts', l: 'discounts', level: 50 },
    { to: '/printer', l: 'printer', level: 100 },
    { to: '/users', l: 'usersTab', level: 50 },
    { to: '/settings', l: 'settingsTab', level: 50 },
    { to: '/m', l: 'mobile', level: 50 },
  ];
  const visibleTabs = tabs.filter((t) => levelAtLeast(user, t.level));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <StoreClosedBanner />
      <TopMenuBar onNav={menuNav} />
      <Toolbar
        onRefresh={() => location.reload()}
        onPrint={() => window.print()}
        onUsers={() => nav('/users')}
        onLock={() => setLocked(true)}
        onLogout={doLogout}
      />
      <HeaderBar />
      <div className="app-tabs" dir={dir}>
        {visibleTabs.map((tab) => (
          <Link key={tab.to} to={tab.to} style={{ padding: '4px 12px', border: '1px solid var(--k-border)', borderRadius: 6, background: loc.pathname === tab.to ? 'var(--surface)' : 'transparent', textDecoration: 'none', color: 'var(--text)', fontWeight: loc.pathname === tab.to ? 'bold' : 'normal' }}>
            {t(tab.l)}
          </Link>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route path="/" element={<OrdersLogPage onNewOrder={() => nav('/pos')} onResume={resumeOrder} />} />
          <Route path="/pos" element={<POSPage onBack={() => nav('/')} />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/categories" element={<RequireLevel level={50}><CategoriesPage /></RequireLevel>} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/stocktake" element={<RequireLevel level={50}><StockTakePage /></RequireLevel>} />
          <Route path="/purchases" element={<RequireLevel level={50}><PurchasesPage /></RequireLevel>} />
          <Route path="/suppliers" element={<RequireLevel level={50}><SuppliersPage /></RequireLevel>} />
          <Route path="/manufacturing" element={<RequireLevel level={50}><ManufacturingPage /></RequireLevel>} />
          <Route path="/shifts" element={<RequireLevel level={50}><ShiftsPage /></RequireLevel>} />
          <Route path="/hr" element={<RequireLevel level={100}><HRPage /></RequireLevel>} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/audit" element={<RequireLevel level={50}><AuditPage /></RequireLevel>} />
          <Route path="/discounts" element={<RequireLevel level={50}><DiscountCodesPage /></RequireLevel>} />
          <Route path="/printer" element={<RequireLevel level={100}><PrinterSettingsPage /></RequireLevel>} />
          <Route path="/settings" element={<RequireLevel level={50}><SettingsPage /></RequireLevel>} />
          <Route path="/reports" element={<RequireLevel level={50}><ReportsPage /></RequireLevel>} />
          <Route path="/users" element={<RequireLevel level={50}><UserManagementPage /></RequireLevel>} />
          <Route path="/m" element={<MobileRoute />} />
          <Route path="/display" element={<CustomerDisplayPage />} />
          <Route path="/order/:token" element={<PublicOrderPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export type { RoleName };

/** §7 — auth-guarded route for the mobile PWA: redirect to login when not
 * authenticated, show permission error when level is too low. */
function MobileRoute() {
  const { user } = useAuth();
  if (!user) return <LoginPage onDone={() => location.reload()} />;
  if (!levelAtLeast(user, 50)) {
    return (
      <div className="denied" dir="ltr">
        <div className="kerr" style={{ display: 'inline-block' }}>This page requires Manager or Owner access.</div>
      </div>
    );
  }
  return <MobileApp />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Shell />} />
          <Route path="/*" element={<Shell />} />
          {/* §1 — public order page must render WITHOUT login (QR link). */}
          <Route path="/order/:token" element={<PublicOrderPage standalone />} />
          {/* §2 — customer-facing mirror window; no auth needed (read-only). */}
          <Route path="/display" element={<CustomerDisplayPage />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
