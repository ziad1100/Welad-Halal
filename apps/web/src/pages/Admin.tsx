import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';
import { useAuth } from '../store/auth';
import { ProductModal } from '../components/product/ProductModal';

export function ProductsPage() {
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['admin-products', q], queryFn: async () => (await api.get('/products', { params: { search: q, active: 'false' } })).data });
  return (
    <div style={{ padding: 8 }} dir="rtl">
      <div className="krow">
        <input className="kinput" placeholder="بحث..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="kbtn" onClick={() => refetch()}>بحث</button>
        <button className="kbtn kbtn-primary" onClick={() => setShow(true)}>+ صنف جديد</button>
        {msg && <span className="kok">{msg}</span>}
      </div>
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr><th>الصنف</th><th>الباركود</th><th>التصنيف</th><th>الشراء</th><th>البيع</th><th>المخزون</th><th>نشط</th></tr></thead>
        <tbody>{(data || []).map((p: any) => <tr key={p.id}><td>{p.nameAr || p.name}</td><td>{p.barcode}</td><td>{p.category?.name}</td><td>{Number(p.purchasePrice)}</td><td>{Number(p.retailPrice)}</td><td>{p.inventory ? Number(p.inventory.quantity) : '—'}</td><td>{p.active ? 'نعم' : 'لا'}</td></tr>)}</tbody>
      </table></div>
      {show && <ProductModal onClose={() => setShow(false)} onSaved={() => { setShow(false); refetch(); setMsg('تم الحفظ'); }} />}
    </div>
  );
}

export function InventoryPage() {
  const [low, setLow] = useState(false);
  const { data, refetch } = useQuery({ queryKey: ['inv', low], queryFn: async () => (await api.get('/inventory', { params: low ? { low: 'true' } : {} })).data });
  const { data: moves } = useQuery({ queryKey: ['moves'], queryFn: async () => (await api.get('/inventory/movements')).data });
  const [err, setErr] = useState('');
  async function setStock(productId: string, quantity: number) {
    setErr('');
    try { await api.post('/inventory/set', { productId, quantity }); refetch(); }
    catch (e: any) { setErr(apiError(e)); }
  }
  return (
    <div style={{ padding: 8, display: 'flex', gap: 8 }} dir="rtl">
      <div style={{ flex: 1 }}>
        <div className="krow"><label><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> منخفض فقط</label>
          <button className="kbtn" onClick={() => refetch()}>تحديث</button></div>
        {err && <div className="kerr">{err}</div>}
        <div className="ktable-wrap"><table className="ktable">
          <thead><tr><th>المنتج</th><th>الحالي</th><th>الأدنى</th><th>الحالة</th><th>تسوية</th></tr></thead>
          <tbody>{(data || []).map((r: any) => (
            <tr key={r.productId}><td>{r.product?.nameAr || r.product?.name}</td><td>{Number(r.quantity)}</td><td>{Number(r.minimumQuantity)}</td>
              <td>{Number(r.quantity) <= Number(r.minimumQuantity) ? 'منخفض' : 'سليم'}</td>
              <td><button className="kbtn" onClick={() => { const v = prompt('الرصيد الجديد:', String(Number(r.quantity))); if (v !== null) setStock(r.productId, Number(v)); }}>تسوية</button></td></tr>))}
          </tbody>
        </table></div>
      </div>
      <div style={{ flex: 1 }}>
        <h4>حركات المخزون</h4>
        <div className="ktable-wrap" style={{ maxHeight: 500 }}><table className="ktable">
          <thead><tr><th>الصنف</th><th>النوع</th><th>الكمية</th><th>المرجع</th><th>الوقت</th></tr></thead>
          <tbody>{(moves || []).slice(0, 100).map((m: any) => <tr key={m.id}><td>{m.product?.nameAr || m.product?.name}</td><td>{m.type}</td><td>{Number(m.quantity)}</td><td>{m.referenceId?.slice(0, 8)}</td><td>{new Date(m.createdAt).toLocaleString('ar-EG')}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { data: sales } = useQuery({ queryKey: ['rep-sales'], queryFn: async () => (await api.get('/reports/sales')).data });
  const { data: top } = useQuery({ queryKey: ['rep-top'], queryFn: async () => (await api.get('/reports/products')).data });
  const { data: daily } = useQuery({ queryKey: ['rep-daily'], queryFn: async () => (await api.get('/reports/daily')).data });
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState(0);
  const [expMsg, setExpMsg] = useState('');
  async function addExpense() {
    try { await api.post('/expenses', { title: expTitle, amount: Number(expAmount) }); setExpMsg('تم حفظ المصروف'); setExpTitle(''); }
    catch (e: any) { setExpMsg(apiError(e)); }
  }
  return (
    <div style={{ padding: 8, display: 'flex', gap: 8 }} dir="rtl">
      <div className="kpanel" style={{ flex: 1 }}>
        <h4>ملخص المبيعات</h4>
        <div>عدد الطلبات: <b>{sales?.orders ?? '—'}</b></div>
        <div>إجمالي المبيعات: <b>{sales?.totalSales ?? '—'}</b></div>
        <div>إجمالي الكمية: <b>{sales?.totalQuantity ?? '—'}</b></div>
        <h4>الملخص اليومي</h4>
        <div>الطلبات: <b>{daily?.orders}</b> — المبيعات: <b>{daily?.sales}</b> — المصروفات: <b>{daily?.expenses}</b> — الصافي: <b>{daily?.net}</b></div>
        <h4>مصروف جديد</h4>
        <div className="krow"><input className="kinput" placeholder="البيان" value={expTitle} onChange={(e) => setExpTitle(e.target.value)} />
          <input className="kinput" type="number" value={expAmount} onChange={(e) => setExpAmount(Number(e.target.value))} style={{ width: 100 }} />
          <button className="kbtn" onClick={addExpense}>حفظ</button><span>{expMsg}</span></div>
      </div>
      <div className="kpanel" style={{ flex: 1 }}>
        <h4>الأصناف الأكثر مبيعاً</h4>
        <div className="ktable-wrap"><table className="ktable">
          <thead><tr><th>الصنف</th><th>الكمية</th><th>القيمة</th></tr></thead>
          <tbody>{(top || []).map((t: any) => <tr key={t.productId}><td>{t.name}</td><td>{t.quantity}</td><td>{t.value}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}

export function UsersPage() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get('/users')).data, retry: false });
  if (user?.role !== 'ADMIN') return <div style={{ padding: 12 }} dir="rtl">هذه الصفحة للإدارة فقط — هذا المستخدم غير مصرح له.</div>;
  return (
    <div style={{ padding: 8 }} dir="rtl">
      <h4>المستخدمون</h4>
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>نشط</th></tr></thead>
        <tbody>{(data || []).map((u: any) => <tr key={u.id}><td>{u.name}</td><td>{u.username}</td><td>{u.role}</td><td>{u.active ? 'نعم' : 'لا'}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
