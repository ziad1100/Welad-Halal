import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';

export function SuppliersPage() {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [msg, setMsg] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const { data, refetch } = useQuery({ queryKey: ['suppliers', search], queryFn: async () => (await api.get('/suppliers', { params: { search } })).data });

  async function create() {
    try { await api.post('/suppliers', form); setMsg('تم الحفظ'); setForm({ name: '', phone: '', address: '' }); refetch(); }
    catch (e: any) { setMsg(apiError(e)); }
  }
  async function open(id: string) {
    try { setDetail((await api.get(`/suppliers/${id}`)).data); }
    catch (e: any) { setMsg(apiError(e)); }
  }

  return (
    <div style={{ padding: 8, display: 'flex', gap: 8 }} dir="rtl">
      <div style={{ flex: 1 }}>
        <h4>الموردون والعملاء — الموردون</h4>
        <div className="krow">
          <input className="kinput" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="kbtn" onClick={() => refetch()}>بحث</button>
        </div>
        <div className="ktable-wrap"><table className="ktable">
          <thead><tr><th>الاسم</th><th>الهاتف</th><th>مشتريات</th><th>أصناف</th><th></th></tr></thead>
          <tbody>{(data || []).map((s: any) => <tr key={s.id} onClick={() => open(s.id)}>
            <td>{s.name}</td><td>{s.phone || '—'}</td><td>{s._count?.purchases ?? '—'}</td><td>{s._count?.products ?? '—'}</td>
            <td><button className="kbtn">التفاصيل</button></td></tr>)}</tbody>
        </table></div>
      </div>
      <div style={{ width: 320 }}>
        <div className="kpanel">
          <h4>مورد جديد</h4>
          <div className="krow"><input className="kinput" placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="krow"><input className="kinput" placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="krow"><input className="kinput" placeholder="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ width: '100%' }} /></div>
          <button className="kbtn kbtn-primary" disabled={!form.name.trim()} onClick={create}>حفظ</button>
          <span>{msg}</span>
        </div>
        {detail && (
          <div className="kpanel" style={{ marginTop: 8 }}>
            <h4>{detail.name}</h4>
            <div>الهاتف: {detail.phone || '—'}</div>
            <div>العنوان: {detail.address || '—'}</div>
            <h4>آخر المشتريات</h4>
            {(detail.purchases || []).map((p: any) => <div key={p.id}>• {Number(p.total)} ج.م — {new Date(p.createdAt).toLocaleDateString('ar-EG')}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

export function ManufacturingPage() {
  const [bundleId, setBundleId] = useState('');
  const [compBarcode, setCompBarcode] = useState('');
  const [compQty, setCompQty] = useState(1);
  const [makeQty, setMakeQty] = useState(1);
  const [msg, setMsg] = useState('');
  const { data: bundles, refetch } = useQuery({ queryKey: ['bundles'], queryFn: async () => (await api.get('/manufacturing/bundles')).data });
  const { data: comp, refetch: refetchComp } = useQuery({
    queryKey: ['composition', bundleId], enabled: !!bundleId,
    queryFn: async () => (await api.get(`/manufacturing/bundles/${bundleId}`)).data,
  });

  async function addComponent() {
    try {
      const prod = (await api.get(`/products/barcode/${encodeURIComponent(compBarcode.trim())}`)).data;
      if (!prod) { setMsg('المنتج غير موجود'); return; }
      await api.post('/manufacturing/components', { bundleId, componentId: prod.id, quantity: Number(compQty) });
      setMsg('تمت إضافة المكون'); setCompBarcode(''); refetchComp(); refetch();
    } catch (e: any) { setMsg(apiError(e)); }
  }
  async function compose() {
    try { await api.post('/manufacturing/compose', { bundleId, quantity: Number(makeQty) }); setMsg(`تم تجميع ${makeQty} وحدة`); refetchComp(); refetch(); }
    catch (e: any) { setMsg(apiError(e)); }
  }

  return (
    <div style={{ padding: 8 }} dir="rtl">
      <h4>التصنيع — الأصناف المجمعة</h4>
      <div className="krow">
        <select className="kselect" value={bundleId} onChange={(e) => setBundleId(e.target.value)}>
          <option value="">اختر صنفاً مجمعاً…</option>
          {(bundles || []).map((b: any) => <option key={b.id} value={b.id}>{b.nameAr || b.name} (رصيد: {b.inventory ? Number(b.inventory.quantity) : 0})</option>)}
        </select>
        <span>{msg}</span>
      </div>
      {comp && (
        <>
          <h4>المكونات</h4>
          <div className="ktable-wrap"><table className="ktable">
            <thead><tr><th>المكون</th><th>الكمية/وحدة</th><th>رصيد المكون</th><th></th></tr></thead>
            <tbody>{(comp.components || []).map((c: any) => <tr key={c.componentId}>
              <td>{c.component?.nameAr || c.component?.name}</td><td>{Number(c.quantity)}</td>
              <td>{c.component?.inventory ? Number(c.component.inventory.quantity) : '—'}</td>
              <td><button className="kbtn" onClick={async () => { await api.delete(`/manufacturing/components/${bundleId}/${c.componentId}`); refetchComp(); }}>حذف</button></td></tr>)}</tbody>
          </table></div>
          <div className="krow">
            <input className="kinput" placeholder="باركود المكون" value={compBarcode} onChange={(e) => setCompBarcode(e.target.value)} style={{ width: 150 }} />
            <input className="kinput" type="number" value={compQty} onChange={(e) => setCompQty(Number(e.target.value))} style={{ width: 70 }} />
            <button className="kbtn" onClick={addComponent}>إضافة مكون</button>
          </div>
          <div className="krow">
            <span className="klabel">تجميع كمية</span>
            <input className="kinput" type="number" value={makeQty} onChange={(e) => setMakeQty(Number(e.target.value))} style={{ width: 80 }} />
            <button className="kbtn kbtn-primary" onClick={compose}>تجميع من المخزون</button>
          </div>
        </>
      )}
    </div>
  );
}

export function HRPage() {
  const [form, setForm] = useState({ name: '', username: '', password: '', phone: '', salary: 0, role: 'CASHIER' });
  const [msg, setMsg] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['employees'], queryFn: async () => (await api.get('/employees')).data, retry: false });

  async function create() {
    try { await api.post('/employees', { ...form, salary: Number(form.salary) }); setMsg('تمت إضافة الموظف'); setForm({ name: '', username: '', password: '', phone: '', salary: 0, role: 'CASHIER' }); refetch(); }
    catch (e: any) { setMsg(apiError(e)); }
  }

  return (
    <div style={{ padding: 8 }} dir="rtl">
      <h4>شؤون العاملين</h4>
      <div className="krow">
        <input className="kinput" placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="kinput" placeholder="اسم المستخدم" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input className="kinput" type="password" placeholder="كلمة المرور" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="kinput" placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="kinput" type="number" placeholder="الراتب" value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} style={{ width: 90 }} />
        <select className="kselect" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="CASHIER">كاشير</option><option value="MANAGER">مدير</option><option value="ADMIN">مدير نظام</option>
        </select>
        <button className="kbtn kbtn-primary" onClick={create}>إضافة موظف</button>
        <span>{msg}</span>
      </div>
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>الهاتف</th><th>الراتب</th><th>نشط</th></tr></thead>
        <tbody>{(data || []).map((e: any) => <tr key={e.id}><td>{e.user?.name}</td><td>{e.user?.username}</td><td>{e.user?.role}</td>
          <td>{e.phone || '—'}</td><td>{Number(e.salary)}</td><td>{e.user?.active ? 'نعم' : 'لا'}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
