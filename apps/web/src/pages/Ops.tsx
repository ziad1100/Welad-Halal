import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';

export function PurchasesPage() {
  const [supplier, setSupplier] = useState('');
  const [barcode, setBarcode] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [lines, setLines] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ t: 'err' | 'ok'; m: string } | null>(null);
  const { data: history, refetch } = useQuery({ queryKey: ['purchases'], queryFn: async () => (await api.get('/purchases')).data });

  async function addLine() {
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(barcode.trim())}`);
      if (!data) { setMsg({ t: 'err', m: 'المنتج غير موجود' }); return; }
      setLines([...lines, { productId: data.id, name: data.nameAr || data.name, quantity: Number(qty), purchasePrice: Number(price) }]);
      setBarcode('');
    } catch { setMsg({ t: 'err', m: 'المنتج غير موجود' }); }
  }

  async function submit() {
    setMsg(null);
    try {
      await api.post('/purchases', { supplierName: supplier, items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, purchasePrice: l.purchasePrice })) });
      setMsg({ t: 'ok', m: 'تم استلام المشتريات وزيادة المخزون' });
      setLines([]); setSupplier(''); refetch();
    } catch (e: any) { setMsg({ t: 'err', m: apiError(e) }); }
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.purchasePrice, 0);

  return (
    <div style={{ padding: 8 }} dir="rtl">
      <h4>المشتريات — استلام بضاعة وزيادة المخزون</h4>
      {msg && <div className={msg.t === 'err' ? 'kerr' : 'kok'}>{msg.m}</div>}
      <div className="krow">
        <span className="klabel">المورد</span><input className="kinput" value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ width: 200 }} />
        <span className="klabel">باركود</span><input className="kinput" value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addLine(); }} style={{ width: 140 }} />
        <span className="klabel">الكمية</span><input className="kinput" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 70 }} />
        <span className="klabel">سعر الشراء</span><input className="kinput" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ width: 90 }} />
        <button className="kbtn" onClick={addLine}>إضافة سطر</button>
      </div>
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الشراء</th><th>الإجمالي</th><th></th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i}><td>{l.name}</td><td>{l.quantity}</td><td>{l.purchasePrice}</td><td>{l.quantity * l.purchasePrice}</td>
          <td><button className="kbtn" onClick={() => setLines(lines.filter((_, j) => j !== i))}>حذف</button></td></tr>)}</tbody>
      </table></div>
      <div className="krow"><b>الإجمالي: {total}</b>
        <button className="kbtn kbtn-primary" disabled={!lines.length || !supplier.trim()} onClick={submit}>استلام وتخزين</button></div>
      <h4>سجل المشتريات</h4>
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr><th>المورد</th><th>الإجمالي</th><th>الأصناف</th><th>التاريخ</th></tr></thead>
        <tbody>{(history || []).map((h: any) => <tr key={h.id}><td>{h.supplierName}</td><td>{Number(h.total)}</td>
          <td>{h.items?.map((i: any) => i.product?.nameAr || i.product?.name).join('، ')}</td><td>{new Date(h.createdAt).toLocaleString('ar-EG')}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

export function CategoriesPage() {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['cats-admin'], queryFn: async () => (await api.get('/categories')).data });

  async function create() {
    try { await api.post('/categories', { name }); setMsg('تم الحفظ'); setName(''); refetch(); }
    catch (e: any) { setMsg(apiError(e)); }
  }
  async function toggle(c: any) {
    try { await api.patch(`/categories/${c.id}`, { name: c.name, active: !c.active }); refetch(); }
    catch (e: any) { setMsg(apiError(e)); }
  }

  return (
    <div style={{ padding: 8 }} dir="rtl">
      <h4>التصنيفات</h4>
      <div className="krow">
        <input className="kinput" placeholder="اسم تصنيف جديد" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="kbtn kbtn-primary" disabled={!name.trim()} onClick={create}>إضافة</button>
        <span>{msg}</span>
      </div>
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr><th>الاسم</th><th>نشط</th><th></th></tr></thead>
        <tbody>{(data || []).map((c: any) => <tr key={c.id}><td>{c.nameAr || c.name}</td><td>{c.active ? 'نعم' : 'لا'}</td>
          <td><button className="kbtn" onClick={() => toggle(c)}>{c.active ? 'تعطيل' : 'تفعيل'}</button></td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

export function ExpensesPage() {
  const [f, setF] = useState({ title: '', amount: 0, category: 'general', notes: '' });
  const [msg, setMsg] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['expenses'], queryFn: async () => (await api.get('/expenses')).data });

  async function save() {
    try { await api.post('/expenses', { ...f, amount: Number(f.amount) }); setMsg('تم حفظ المصروف'); setF({ title: '', amount: 0, category: 'general', notes: '' }); refetch(); }
    catch (e: any) { setMsg(apiError(e)); }
  }
  const total = (data || []).reduce((s: number, e: any) => s + Number(e.amount), 0);

  return (
    <div style={{ padding: 8 }} dir="rtl">
      <h4>المصروفات (الإجمالي: {total})</h4>
      <div className="krow">
        <input className="kinput" placeholder="البيان" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input className="kinput" type="number" placeholder="المبلغ" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} style={{ width: 100 }} />
        <input className="kinput" placeholder="الفئة" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 110 }} />
        <input className="kinput" placeholder="ملاحظات" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={{ width: 180 }} />
        <button className="kbtn kbtn-primary" disabled={!f.title.trim() || !(f.amount > 0)} onClick={save}>حفظ</button>
        <span>{msg}</span>
      </div>
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr><th>البيان</th><th>المبلغ</th><th>الفئة</th><th>ملاحظات</th><th>التاريخ</th></tr></thead>
        <tbody>{(data || []).map((e: any) => <tr key={e.id}><td>{e.title}</td><td>{Number(e.amount)}</td><td>{e.category}</td><td>{e.notes || '—'}</td><td>{new Date(e.createdAt).toLocaleString('ar-EG')}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

export function AuditPage() {
  const [action, setAction] = useState('ALL');
  const { data } = useQuery({ queryKey: ['audit', action], queryFn: async () => (await api.get('/audit', { params: { action } })).data, retry: false });
  const actions = ['ALL', 'login', 'product.create', 'price.change', 'inventory.adjust', 'order.hold', 'order.confirm', 'order.cancel', 'order.return', 'user.create', 'user.update'];

  return (
    <div style={{ padding: 8 }} dir="rtl">
      <h4>سجل العمليات (Audit)</h4>
      <div className="krow">
        <select className="kselect" value={action} onChange={(e) => setAction(e.target.value)}>
          {actions.map((a) => <option key={a} value={a}>{a === 'ALL' ? 'كل العمليات' : a}</option>)}
        </select>
      </div>
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr><th>العملية</th><th>الكيان</th><th>المستخدم</th><th>تفاصيل</th><th>الوقت</th></tr></thead>
        <tbody>{(data || []).map((l: any) => <tr key={l.id}><td>{l.action}</td><td>{l.entity || '—'}</td>
          <td>{l.user?.username || '—'}</td><td>{l.details || '—'}</td><td>{new Date(l.createdAt).toLocaleString('ar-EG')}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
