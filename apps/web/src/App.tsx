import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import './styles/kstore.css';
import { useAuth } from './store/auth';
import { RequireRole } from './components/shared/ui';
import { TopMenuBar, HeaderBar, Toolbar } from './components/layout/chrome';
import { LoginPage } from './pages/Login';
import { OrdersLogPage } from './pages/OrdersLog';
import { POSPage } from './pages/POS';
import { ProductsPage, InventoryPage, ReportsPage, UsersPage } from './pages/Admin';
import { PurchasesPage, CategoriesPage, ExpensesPage, AuditPage } from './pages/Ops';
import { SuppliersPage, ManufacturingPage, HRPage } from './pages/Erp';

const qc = new QueryClient();

function Shell() {
  const { user, ready, logout, init } = useAuth();
  const [locked, setLocked] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => { init(); }, [init]);

  if (!ready) {
    return <div className="login-wrap" dir="rtl"><div className="kpanel">جاري التحقق من الجلسة…</div></div>;
  }

  if (!user || locked) {
    return <LoginPage onDone={() => { setLocked(false); nav('/'); }} />;
  }

  function menuNav(m: string) {
    if (m === 'المبيعات') nav('/');
    else if (m === 'المشتريات') nav('/purchases');
    else if (m === 'المخزن') nav('/inventory');
    else if (m === 'الموردون والعملاء') nav('/suppliers');
    else if (m === 'تصنيع') nav('/manufacturing');
    else if (m === 'تقارير العمل') nav('/reports');
    else if (m === 'أدوات') nav('/audit');
    else if (m === 'شؤون الموظفين') nav('/hr');
    else if (m === 'الإدارة') nav('/users');
    else nav('/');
  }

  const tabs = [
    { to: '/', l: 'سجل الطلبات', roles: ['ADMIN', 'MANAGER', 'CASHIER'] as const },
    { to: '/pos', l: 'طلب جديد (POS)', roles: ['ADMIN', 'MANAGER', 'CASHIER'] as const },
    { to: '/products', l: 'الأصناف', roles: ['ADMIN', 'MANAGER', 'CASHIER'] as const },
    { to: '/categories', l: 'التصنيفات', roles: ['ADMIN', 'MANAGER'] as const },
    { to: '/inventory', l: 'المخزون', roles: ['ADMIN', 'MANAGER', 'CASHIER'] as const },
    { to: '/purchases', l: 'المشتريات', roles: ['ADMIN', 'MANAGER'] as const },
    { to: '/suppliers', l: 'الموردون', roles: ['ADMIN', 'MANAGER'] as const },
    { to: '/manufacturing', l: 'التصنيع', roles: ['ADMIN', 'MANAGER'] as const },
    { to: '/hr', l: 'العاملون', roles: ['ADMIN'] as const },
    { to: '/expenses', l: 'المصروفات', roles: ['ADMIN', 'MANAGER', 'CASHIER'] as const },
    { to: '/reports', l: 'التقارير', roles: ['ADMIN', 'MANAGER'] as const },
    { to: '/audit', l: 'السجل', roles: ['ADMIN', 'MANAGER'] as const },
    { to: '/users', l: 'المستخدمون', roles: ['ADMIN'] as const },
  ];
  const visibleTabs = tabs.filter((t) => user && (t.roles as readonly string[]).includes(user.role));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopMenuBar onNav={menuNav} />
      <Toolbar
        onRefresh={() => location.reload()}
        onPrint={() => window.print()}
        onUsers={() => nav('/users')}
        onLock={() => setLocked(true)}
        onLogout={() => { logout(); nav('/'); }}
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
          <Route path="/categories" element={<RequireRole roles={['ADMIN', 'MANAGER']}><CategoriesPage /></RequireRole>} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/purchases" element={<RequireRole roles={['ADMIN', 'MANAGER']}><PurchasesPage /></RequireRole>} />
          <Route path="/suppliers" element={<RequireRole roles={['ADMIN', 'MANAGER']}><SuppliersPage /></RequireRole>} />
          <Route path="/manufacturing" element={<RequireRole roles={['ADMIN', 'MANAGER']}><ManufacturingPage /></RequireRole>} />
          <Route path="/hr" element={<RequireRole roles={['ADMIN']}><HRPage /></RequireRole>} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/audit" element={<RequireRole roles={['ADMIN', 'MANAGER']}><AuditPage /></RequireRole>} />
          <Route path="/reports" element={<RequireRole roles={['ADMIN', 'MANAGER']}><ReportsPage /></RequireRole>} />
          <Route path="/users" element={<RequireRole roles={['ADMIN']}><UsersPage /></RequireRole>} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </QueryClientProvider>
  );
}
