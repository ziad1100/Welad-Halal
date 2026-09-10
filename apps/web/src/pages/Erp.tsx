import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';
import { validateOptionalPhone } from '../utils/phone';
import { SearchableSelect } from '../components/shared/SearchableSelect';
import { SearchableDatalist } from '../components/shared/SearchableDatalist';
import { lookupEmployees, lookupBundles } from '../services/lookups';
import { useSettings } from '../store/settings';
import { useDir } from '../store/lang';

interface ShiftRow {
  id: string;
  status: 'open' | 'closed';
  openingCashAmount: number;
  expectedCashAmount: number | null;
  closingCashAmount: number | null;
  discrepancyAmount: number | null;
  startedAt: string;
  endedAt: string | null;
  employee?: { user?: { username?: string; fullName?: string } };
  closedBy?: { username?: string; fullName?: string } | null;
}

/** §4 — Shift reconciliation panel inside the HR module for Owner/Manager.
 * Shows the current cashier shift state plus a compact recent-history list
 * with discrepancy flagged when it exceeds the configured threshold. */
export function ShiftsPanel({ threshold }: { threshold: number }) {
  const [history, setHistory] = useState<ShiftRow[]>([]);
  const [current, setCurrent] = useState<ShiftRow | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const [hRes, cRes] = await Promise.all([
        api.get('/shifts', { params: { employeeId: employeeFilter || undefined } }),
        api.get('/shifts/me/current'),
      ]);
      setHistory(hRes.data || []);
      setCurrent(cRes.data?.shift || null);
    } catch { /* stale session → UI still renders */ }
    finally { setRefreshing(false); }
  }

  useEffect(() => { void load(); }, [employeeFilter]);

  const openCount = (history || []).filter((s) => s.status === 'open').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="kpanel">
        <div className="krow" style={{ marginBottom: 6 }}>
          <span className="klabel">تسوية درج النقدية — نظرة عامة</span>
          <span className="kstatus">{openCount > 0 ? `🟢 ${openCount} شيفت مفتوح` : 'لا شيفتات مفتوحة'}</span>
        </div>
        <div className="kpanel" style={{ background: 'var(--surface-2)', padding: 8 }}>
          <div className="krow"><span className="klabel">الموظف النشط</span><b>{current?.employee?.user?.fullName || current?.employee?.user?.username || '—'}</b></div>
          <div className="krow"><span className="klabel">حالة الشيفت</span>{current ? (current.status === 'open' ? <span className="kstatus">مفتوح منذ {new Date(current.startedAt).toLocaleTimeString('ar-EG')}</span> : <span style={{ color: 'var(--muted)' }}>مغلق</span>) : <span style={{ color: 'var(--muted)' }}>لا يوجد شيفت مفتوح</span>}</div>
          {current?.expectedCashAmount != null && (
            <div className="krow"><span className="klabel">المتوقع (حالياً)</span><b style={{ color: 'var(--k-confirm)' }}>{Number(current.expectedCashAmount).toFixed(2)} ج.م</b></div>
          )}
        </div>
      </div>

      <div className="kpanel">
        <div className="krow" style={{ marginBottom: 6 }}>
          <h4 style={{ margin: 0 }}>السجل — الشيفتات</h4>
          <span style={{ flex: 1 }} />
          <SearchableSelect value={employeeFilter} loadOptions={lookupEmployees()}
            placeholder="كل الموظفين — اكتب للبحث…" onChange={(v) => setEmployeeFilter(v)} />
          <button className="kbtn" disabled={refreshing} onClick={load}>{refreshing ? '...' : 'تحديث'}</button>
        </div>
        <div className="ktable-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="ktable">
            <thead><tr>
              <th>الكاشير</th><th>البداية</th><th>النهاية</th><th>افتتاح</th><th>المتوقع</th>
              <th>المعدود</th><th>الفرق</th><th>الحالة</th><th>أغلق بواسطة</th>
            </tr></thead>
            <tbody>
              {(history || []).map((s: ShiftRow) => {
                const disc = s.discrepancyAmount === null ? null : Number(s.discrepancyAmount);
                const flag = disc !== null && Math.abs(disc) > threshold;
                return (
                  <tr key={s.id}>
                    <td>{s.employee?.user?.fullName || s.employee?.user?.username || '—'}</td>
                    <td>{new Date(s.startedAt).toLocaleString('ar-EG')}</td>
                    <td>{s.endedAt ? new Date(s.endedAt).toLocaleString('ar-EG') : '—'}</td>
                    <td>{Number(s.openingCashAmount).toFixed(2)}</td>
                    <td>{s.expectedCashAmount === null ? '—' : Number(s.expectedCashAmount).toFixed(2)}</td>
                    <td>{s.closingCashAmount === null ? '—' : Number(s.closingCashAmount).toFixed(2)}</td>
                    <td style={{ color: flag ? '#E5484D' : undefined, fontWeight: flag ? 700 : undefined }}>
                      {disc === null ? '—' : (disc > 0 ? `+${disc.toFixed(2)}` : disc.toFixed(2))}
                      {flag && ' ⚠'}
                    </td>
                    <td>{s.status === 'open' ? <span className="kstatus">مفتوح</span> : <span className="kstatus">مغلق</span>}</td>
                    <td>{s.closedBy?.fullName || s.closedBy?.username || '—'}</td>
                  </tr>
                );
              })}
              {(history || []).length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)' }}>لا توجد شيفتات مسجلة حتى الآن.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="kpanel" style={{ fontSize: 12, marginTop: 6, background: 'var(--surface-2)', padding: 6 }}>
          المتوقع = نقدية الافتتاح + مبيعات مؤكدة نقدية − مرتجعات نقدية. الفرق = المعدود − المتوقع.
          يُعلَّم بالأحمر إذا تجاوز حد {threshold} ج.م (قابل للتعديل من صفحة الإعدادات).
        </div>
      </div>
    </div>
  );
}

export function SuppliersPage() {
  const [search, setSearch] = useState('');
  const dir = useDir();
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [msg, setMsg] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const { data, refetch } = useQuery({ queryKey: ['suppliers', search], queryFn: async () => (await api.get('/suppliers', { params: { search } })).data });

  async function create() {
    const phoneErr = validateOptionalPhone(form.phone);
    if (phoneErr) { setMsg(phoneErr); return; }
    try { await api.post('/suppliers', form); setMsg('تم الحفظ'); setForm({ name: '', phone: '', address: '' }); refetch(); }
    catch (e: any) { setMsg(apiError(e)); }
  }
  async function open(id: string) {
    try { setDetail((await api.get(`/suppliers/${id}`)).data); }
    catch (e: any) { setMsg(apiError(e)); }
  }

  return (
    <div style={{ padding: 8, display: 'flex', gap: 8 }} dir={dir}>
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
  const dir = useDir();
  const [compBarcode, setCompBarcode] = useState('');
  const [compQty, setCompQty] = useState(1);
  const [makeQty, setMakeQty] = useState(1);
  const [msg, setMsg] = useState('');
  const { refetch } = useQuery({ queryKey: ['bundles'], queryFn: async () => (await api.get('/manufacturing/bundles')).data });
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
    <div style={{ padding: 8 }} dir={dir}>
      <h4>التصنيع — الأصناف المجمعة</h4>
      <div className="krow">
        <SearchableSelect label="الصنف المجمع" value={bundleId} loadOptions={lookupBundles()}
          placeholder="اكتب أو اختر صنفاً مجمعاً…" onChange={(v) => setBundleId(v)} />
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
  const [form, setForm] = useState({ name: '', username: '', password: '', phone: '', salary: 0, role: 'employee' });
  const dir = useDir();
  const [msg, setMsg] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['employees'], queryFn: async () => (await api.get('/employees')).data, retry: false });
  const { values } = useSettings();
  const threshold = Number(values?.cash_discrepancy_threshold ?? 20);

  async function create() {
    try { await api.post('/employees', { ...form, salary: Number(form.salary) }); setMsg('تمت إضافة الموظف'); setForm({ name: '', username: '', password: '', phone: '', salary: 0, role: 'employee' }); refetch(); }
    catch (e: any) { setMsg(apiError(e)); }
  }

  return (
    <div style={{ padding: 8, display: 'flex', gap: 12 }} dir={dir}>
      <div style={{ flex: 1 }}>
        <h4>شؤون العاملين — الموظفين</h4>
        <div className="krow">
          <input className="kinput" placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="kinput" placeholder="اسم المستخدم" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="kinput" type="password" placeholder="كلمة المرور" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="kinput" placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="kinput" type="number" placeholder="الراتب" value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} style={{ width: 90 }} />
          <SearchableDatalist value={form.role}
            options={[{ value: 'employee', label: 'موظف (كاشير)' }, { value: 'manager', label: 'مدير' }]}
            placeholder="اكتب أو اختر الدور…" onChange={(v) => setForm({ ...form, role: v || 'employee' })} />
          <button className="kbtn kbtn-primary" onClick={create}>إضافة موظف</button>
          <span>{msg}</span>
        </div>
        <div className="ktable-wrap"><table className="ktable">
          <thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>الهاتف</th><th>الراتب</th><th>نشط</th></tr></thead>
          <tbody>{(data || []).map((e: any) => <tr key={e.id}><td>{e.user?.fullName}</td><td>{e.user?.username}</td><td>{e.user?.role}</td>
            <td>{e.phone || '—'}</td><td>{Number(e.salary)}</td><td>{e.user?.active ? 'نعم' : 'لا'}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div style={{ width: 880 }}>
        <ShiftsPanel threshold={threshold} />
      </div>
    </div>
  );
}
