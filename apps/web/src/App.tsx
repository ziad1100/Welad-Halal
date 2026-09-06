import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './styles/kstore.css';
import { useAuth, levelAtLeast, type RoleName } from './store/auth';
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

const qc = new QueryClient();

/** Employee shell: ONLY the Cashier screen — no menu, tabs, or toolbar in the tree. */
function EmployeeShell({ onLock, onLogout }: { onLock: () => void; onLogout: () => void }) {
  const loc = useLocation();
  const allowed = loc.pathname === '/' || loc.pathname === '/pos';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <HeaderBar />
      <div style={{ flex: 1, minHeight: 0 }}>
        {allowed ? <POSPage onBack={() => onLock()} /> : (
          <div className="denied" dir="rtl">
            <div className="kerr" style={{ display: 'inline-block' }}>هذا المستخدم غير مصرح له — هذه الصفحة تتطلب صلاحية أعلى.</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: 4, borderTop: '1px solid var(--k-border)' }} dir="rtl">
        <button className="kbtn" onClick={onLock}>قفل</button>
        <button className="kbtn" onClick={onLogout}>خروج</button>
      </div>
    </div>
  );
}

function Shell() {
  const { user, ready, logout, init } = useAuth();
  const [locked, setLocked] = useState(false);
  const [pwChanged, setPwChanged] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => { init(); }, [init]);

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
    if (m === 'المبيعات') nav('/');
    else if (m === 'المشتريات') nav('/purchases');
    else if (m === 'المخزن') nav('/inventory');
    else if (m === 'الجرد') nav('/stocktake');
    else if (m === 'الموردون والعملاء') nav('/suppliers');
    else if (m === 'تصنيع') nav('/manufacturing');
    else if (m === 'تقارير العمل') nav('/reports');
    else if (m === 'أدوات') nav('/audit');
    else if (m === 'شؤون الموظفين') nav('/hr');
    else if (m === 'الإدارة') nav('/users');
    else nav('/');
  }

  // Level-based visibility (numeric compare — new levels slot in without rewrites).
  const tabs: { to: string; l: string; level: number }[] = [
    { to: '/', l: 'سجل الطلبات', level: 10 },
    { to: '/pos', l: 'طلب جديد (POS)', level: 10 },
    { to: '/products', l: 'الأصناف', level: 10 },
    { to: '/categories', l: 'التصنيفات', level: 50 },
    { to: '/inventory', l: 'المخزون', level: 10 },
    { to: '/stocktake', l: 'الجرد', level: 50 },
    { to: '/purchases', l: 'المشتريات', level: 50 },
    { to: '/suppliers', l: 'الموردون', level: 50 },
    { to: '/manufacturing', l: 'التصنيع', level: 50 },
    { to: '/hr', l: 'العاملون', level: 100 },
    { to: '/expenses', l: 'المصروفات', level: 10 },
    { to: '/reports', l: 'التقارير', level: 50 },
    { to: '/audit', l: 'السجل', level: 50 },
    { to: '/printer', l: 'الطابعة', level: 100 },
    { to: '/users', l: 'المستخدمون', level: 50 },
  ];
  const visibleTabs = tabs.filter((t) => levelAtLeast(user, t.level));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopMenuBar onNav={menuNav} />
      <Toolbar
        onRefresh={() => location.reload()}
        onPrint={() => window.print()}
        onUsers={() => nav('/users')}
        onLock={() => setLocked(true)}
        onLogout={doLogout}
      />
      <HeaderBar />
      <div style={{ display: 'flex', gap: 2, padding: '4px 8px', background: 'var(--surface-2)', borderBottom: '1px solid var(--k-border)' }} dir="rtl">
        {visibleTabs.map((t) => (
          <Link key={t.to} to={t.to} style={{ padding: '4px 12px', border: '1px solid var(--k-border)', borderRadius: 6, background: loc.pathname === t.to ? 'var(--surface)' : 'transparent', textDecoration: 'none', color: 'var(--text)', fontWeight: loc.pathname === t.to ? 'bold' : 'normal' }}>{t.l}</Link>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route path="/" element={<OrdersLogPage onNewOrder={() => nav('/pos')} />} />
          <Route path="/pos" element={<POSPage onBack={() => nav('/')} />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/categories" element={<RequireLevel level={50}><CategoriesPage /></RequireLevel>} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/stocktake" element={<RequireLevel level={50}><StockTakePage /></RequireLevel>} />
          <Route path="/purchases" element={<RequireLevel level={50}><PurchasesPage /></RequireLevel>} />
          <Route path="/suppliers" element={<RequireLevel level={50}><SuppliersPage /></RequireLevel>} />
          <Route path="/manufacturing" element={<RequireLevel level={50}><ManufacturingPage /></RequireLevel>} />
          <Route path="/hr" element={<RequireLevel level={100}><HRPage /></RequireLevel>} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/audit" element={<RequireLevel level={50}><AuditPage /></RequireLevel>} />
          <Route path="/printer" element={<RequireLevel level={100}><PrinterSettingsPage /></RequireLevel>} />
          <Route path="/reports" element={<RequireLevel level={50}><ReportsPage /></RequireLevel>} />
          <Route path="/users" element={<RequireLevel level={50}><UserManagementPage /></RequireLevel>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export type { RoleName };

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </QueryClientProvider>
  );
}
