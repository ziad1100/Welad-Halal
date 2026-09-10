import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';
import { Modal } from '../components/shared/ui';
import { SearchableDatalist } from '../components/shared/SearchableDatalist';
import { useDir } from '../store/lang';

/** §2 — Discount Code admin screen (unified promotions). Cashiers only apply
 * codes at the POS; creation/editing lives here (Manager/Owner). */
export function DiscountCodesPage() {
  const [msg, setMsg] = useState<{ t: 'err' | 'ok'; m: string } | null>(null);
  const dir = useDir();
  const [editing, setEditing] = useState<any | null>(null);
  const { data, refetch } = useQuery({ queryKey: ['discounts'], queryFn: async () => (await api.get('/discount-codes')).data });

  async function toggle(code: any) {
    try {
      await api.patch(`/discount-codes/${code.id}`, { isActive: !code.isActive });
      refetch();
    } catch (e: any) { setMsg({ t: 'err', m: apiError(e) }); }
  }
  async function remove(code: any) {
    if (!confirm(`تعطيل كود ${code.code} نهائيًا؟`)) return;
    try {
      await api.delete(`/discount-codes/${code.id}`);
      refetch();
    } catch (e: any) { setMsg({ t: 'err', m: apiError(e) }); }
  }

  return (
    <div style={{ padding: 8 }} dir={dir}>
      <div className="krow">
        <h4 style={{ margin: 0 }}>أكواد الخصم — نظام الخصومات الموحد</h4>
        <span style={{ flex: 1 }} />
        <button className="kbtn kbtn-primary" onClick={() => setEditing({ isActive: true })}>+ كود جديد</button>
      </div>
      {msg && <div className={msg.t === 'err' ? 'kerr' : 'kok'}>{msg.m}</div>}
      <div className="ktable-wrap"><table className="ktable">
        <thead><tr>
          <th>الكود</th><th>النوع</th><th>القيمة</th><th>صالح من</th><th>صالح حتى</th>
          <th>الاستخدام</th><th>الحالة</th><th></th>
        </tr></thead>
        <tbody>
          {(data || []).map((c: any) => {
            const used = Number(c.timesUsed ?? 0);
            const limit = c.usageLimit;
            const exhausted = limit !== null && used >= Number(limit);
            return (
              <tr key={c.id}>
                <td><b>{c.code}</b></td>
                <td>{c.discountType === 'percentage' ? 'نسبة %' : 'مبلغ ثابت'}</td>
                <td>{Number(c.discountValue)}{c.discountType === 'percentage' ? '%' : ' ج.م'}</td>
                <td>{c.validFrom ? new Date(c.validFrom).toLocaleDateString('ar-EG') : '—'}</td>
                <td>{c.validUntil ? new Date(c.validUntil).toLocaleDateString('ar-EG') : '—'}</td>
                <td style={{ color: exhausted ? '#E5484D' : undefined }}>{used}{limit !== null ? ` / ${Number(limit)}` : ''}</td>
                <td>{c.isActive ? <span className="kstatus">مفعّل</span> : <span className="kstatus">معطّل</span>}</td>
                <td>
                  <button className="kbtn" onClick={() => setEditing(c)}>تعديل</button>
                  <button className="kbtn" onClick={() => toggle(c)}>{c.isActive ? 'تعطيل' : 'تفعيل'}</button>
                  <button className="kbtn" onClick={() => remove(c)}>حذف</button>
                </td>
              </tr>
            );
          })}
          {(data || []).length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)' }}>لا توجد أكواد خصم بعد — أنشئ أول كود من زر «+ كود جديد».</td></tr>
          )}
        </tbody>
      </table></div>
      {editing && <DiscountCodeModal code={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); setMsg({ t: 'ok', m: 'تم الحفظ' }); }} />}
    </div>
  );
}

function DiscountCodeModal({ code, onClose, onSaved }: { code: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    code: code.code || '',
    discountType: code.discountType || 'percentage',
    discountValue: code.discountValue ?? '',
    validFrom: code.validFrom ? String(code.validFrom).slice(0, 10) : '',
    validUntil: code.validUntil ? String(code.validUntil).slice(0, 10) : '',
    usageLimit: code.usageLimit === null || code.usageLimit === undefined ? '' : String(code.usageLimit),
    isActive: code.isActive !== false,
    notes: code.notes || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const value = Number(f.discountValue);
    if (!f.code.trim()) { setErr('أدخل الكود'); return; }
    if (!(value > 0)) { setErr('أدخل قيمة خصم صحيحة'); return; }
    setErr(''); setBusy(true);
    const body = {
      code: f.code.trim().toUpperCase(),
      discountType: f.discountType,
      discountValue: value,
      validFrom: f.validFrom ? `${f.validFrom}T00:00:00.000Z` : undefined,
      validUntil: f.validUntil ? `${f.validUntil}T23:59:59.999Z` : undefined,
      usageLimit: f.usageLimit === '' ? undefined : Number(f.usageLimit),
      isActive: f.isActive,
      notes: f.notes || undefined,
    };
    try {
      if (code.id) await api.patch(`/discount-codes/${code.id}`, body);
      else await api.post('/discount-codes', body);
      onSaved();
    } catch (e: any) { setErr(apiError(e)); setBusy(false); }
  }

  return (
    <Modal title={code.id ? `تعديل كود ${code.code}` : 'كود خصم جديد'} onClose={onClose} footer={
      <>
        <button className="kbtn kbtn-primary" disabled={busy} onClick={submit}>{busy ? '...' : 'حفظ'}</button>
        <button className="kbtn" onClick={onClose}>إلغاء</button>
      </>
    }>
      {err && <div className="kerr">{err}</div>}
      <div className="krow"><span className="klabel">الكود</span>
        <input className="kinput" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} style={{ width: 160, textTransform: 'uppercase' }} placeholder="WELAD10" /></div>
      <div className="krow"><span className="klabel">النوع</span>
        <SearchableDatalist value={f.discountType}
          options={[{ value: 'percentage', label: 'نسبة مئوية %' }, { value: 'fixed_amount', label: 'مبلغ ثابت (ج.م)' }]}
          placeholder="اكتب أو اختر النوع…" onChange={(v) => setF({ ...f, discountType: v || 'percentage' })} />
        <input className="kinput" type="number" min={0} value={f.discountValue} onChange={(e) => setF({ ...f, discountValue: e.target.value })} style={{ width: 110 }} /></div>
      <div className="krow"><span className="klabel">صالح من</span>
        <input className="kinput" type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></div>
      <div className="krow"><span className="klabel">صالح حتى</span>
        <input className="kinput" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></div>
      <div className="krow"><span className="klabel">حد الاستخدام</span>
        <input className="kinput" type="number" min={0} value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} style={{ width: 110 }} placeholder="غير محدود" /></div>
      <div className="krow"><label><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> مفعّل</label></div>
      <div className="krow"><span className="klabel">ملاحظات</span>
        <input className="kinput" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={{ flex: 1 }} /></div>
    </Modal>
  );
}
