import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import './styles/kstore.css';
import { useAuth } from './store/auth';
import { TopMenuBar, HeaderBar, Toolbar } from './components/layout/chrome';
import { LoginPage } from './pages/Login';
import { OrdersLogPage } from './pages/OrdersLog';
import { POSPage } from './pages/POS';
import { ProductsPage, InventoryPage, ReportsPage, UsersPage } from './pages/Admin';
import { PurchasesPage, CategoriesPage, ExpensesPage, AuditPage } from './pages/Ops';

const qc = new QueryClient();

function Shell() {
  const { user, logout, init } = useAuth();
  const [locked, setLocked] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => { init(); }, [init]);

  if (!user || locked) {
    return <LoginPage onDone={() => { setLocked(false); nav('/'); }} />;
  }

  function menuNav(m: string) {
    if (m === 'المبيعات') nav('/');
    else if (m === 'المشتريات') nav('/purchases');
    else if (m === 'المخزن') nav('/inventory');
    else if (m === 'الموردون والعملاء') nav('/pos');
    else if (m === 'تقارير العمل') nav('/reports');
    else if (m === 'أدوات') nav('/audit');
    else if (m === 'الإدارة' || m === 'شؤون الموظفين') nav('/users');
    else nav('/');
  }

  const tabs = [
    { to: '/', l: 'سجل الطلبات' },
    { to: '/pos', l: 'طلب جديد (POS)' },
    { to: '/products', l: 'الأصناف' },
    { to: '/categories', l: 'التصنيفات' },
    { to: '/inventory', l: 'المخزون' },
    { to: '/purchases', l: 'المشتريات' },
    { to: '/expenses', l: 'المصروفات' },
    { to: '/reports', l: 'التقارير' },
    { to: '/audit', l: 'السجل' },
    { to: '/users', l: 'المستخدمون' },
  ];

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
      <div style={{ display: 'flex', gap: 2, padding: '2px 6px', background: '#ddd', borderBottom: '1px solid var(--k-border)' }} dir="rtl">
        {tabs.map((t) => (
          <Link key={t.to} to={t.to} style={{ padding: '2px 10px', border: '1px solid var(--k-border)', background: loc.pathname === t.to ? '#fff' : '#eee', textDecoration: 'none', color: '#111', fontWeight: loc.pathname === t.to ? 'bold' : 'normal' }}>{t.l}</Link>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route path="/" element={<OrdersLogPage onNewOrder={() => nav('/pos')} />} />
          <Route path="/pos" element={<POSPage onBack={() => nav('/')} />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/users" element={<UsersPage />} />
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
