import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../../services/api';
import { Modal } from '../shared/ui';

const TYPES = [
  { v: 'INVENTORY_ITEM', l: 'صنف مخزني' },
  { v: 'SERVICE_ITEM', l: 'صنف خدمي' },
  { v: 'RAW_MATERIAL', l: 'خامات' },
  { v: 'BUNDLED_ITEM', l: 'صنف مجمع' },
];

const segOn: React.CSSProperties = { background: 'var(--k-confirm)', color: '#fff', borderColor: 'transparent' };

export function ProductModal({ barcode, initialName, onClose, onSaved }: { barcode?: string; initialName?: string; onClose: () => void; onSaved: (p: any) => void }) {
  const [tab, setTab] = useState('pricing');
  const [err, setErr] = useState('');
  const [f, setF] = useState({
    name: initialName || '', nameAr: initialName || '', unit: 'قطعة', barcode: barcode || '',
    supplierCode: '', supplierId: '', description: '', retailPrice: 0, purchasePrice: 0, taxRate: 0,
    quantity: 0, productType: 'INVENTORY_ITEM', categoryId: '',
  });
  const [tiers, setTiers] = useState<{ tier: string; price: number }[]>([{ tier: 'قطاعي', price: 0 }]);
  const [units, setUnits] = useState<{ unit: string; factor: number; price: number }[]>([]);
  const { data: cats } = useQuery({ queryKey: ['cats'], queryFn: async () => (await api.get('/categories')).data });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers-mini'], queryFn: async () => (await api.get('/suppliers')).data });

  async function save() {
    setErr('');
    if (!f.name.trim()) { setErr('اسم الصنف مطلوب'); return; }
    try {
      const { data } = await api.post('/products', {
        ...f, retailPrice: Number(f.retailPrice), purchasePrice: Number(f.purchasePrice),
        taxRate: Number(f.taxRate), quantity: Number(f.quantity),
        supplierId: f.supplierId || undefined,
        priceTiers: tiers.filter((t) => t.tier.trim() && t.price > 0),
        subUnits: units.filter((u) => u.unit.trim() && u.factor > 0),
      });
      onSaved(data);
    } catch (e: any) { setErr(apiError(e)); }
  }

  return (
    <Modal title="بيانات صنف" onClose={onClose} footer={<><button className="kbtn kbtn-primary" onClick={save}>💾 حفظ</button><button className="kbtn" onClick={onClose}>إلغاء (ESC)</button></>}>
      {err && <div className="kerr">{err}</div>}
      {/* segmented type control */}
      <div className="krow" style={{ gap: 0 }}>
        <span className="klabel">النوع:</span>
        <span style={{ display: 'inline-flex', border: '1px solid var(--k-border)', borderRadius: 8, overflow: 'hidden' }}>
          {TYPES.map((t) => (
            <button key={t.v} className="kbtn" style={{ border: 'none', borderRadius: 0, boxShadow: 'none', ...(f.productType === t.v ? segOn : {}) }} onClick={() => setF({ ...f, productType: t.v })}>{t.l}</button>
          ))}
        </span>
      </div>
      <div className="krow">
        <span className="klabel">اسم الصنف *</span>
        <input className="kinput" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, nameAr: e.target.value })} style={{ width: 220, background: f.name ? undefined : '#F6DED4' }} />
        <span className="klabel">الوحدة</span><input className="kinput" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} style={{ width: 90 }} />
      </div>
      <div className="krow">
        <span className="klabel">الباركود</span>
        <input className="kinput" value={f.barcode} dir="ltr" readOnly={!!barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })}
          style={{ width: 180, background: '#1F2A4D', color: '#fff', fontFamily: 'monospace', borderColor: '#1F2A4D' }} />
        <span className="klabel">كود المورد</span><input className="kinput" value={f.supplierCode} onChange={(e) => setF({ ...f, supplierCode: e.target.value })} style={{ width: 110 }} />
      </div>
      <div className="krow">
        <span className="klabel">التصنيف</span>
        <select className="kselect" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
          <option value="">—</option>
          {(cats || []).map((c: any) => <option key={c.id} value={c.id}>{c.nameAr || c.name}</option>)}
        </select>
        <span className="klabel">المورد</span>
        <select className="kselect" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>
          <option value="">—</option>
          {(suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="krow">
        <span className="klabel">الوصف</span><input className="kinput" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ width: '100%' }} />
      </div>
      <div className="ktabs">
        {['pricing|التسعير', 'units|وحدات القياس الفرعية', 'tax|إعدادات الضريبة', 'inventory|المخزون', 'options|خيارات'].map((t) => {
          const [v, l] = t.split('|');
          return <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>{l}</button>;
        })}
      </div>
      {tab === 'pricing' && (
        <>
          <div className="krow">
            <span className="klabel">سعر البيع</span><input className="kinput" type="number" value={f.retailPrice} onChange={(e) => setF({ ...f, retailPrice: Number(e.target.value) })} style={{ width: 110 }} />
            <span className="klabel">سعر الشراء</span><input className="kinput" type="number" value={f.purchasePrice} onChange={(e) => setF({ ...f, purchasePrice: Number(e.target.value) })} style={{ width: 110 }} />
          </div>
          <h4>شرائح سعرية إضافية (قطاعي/جملة…)</h4>
          {tiers.map((t, i) => (
            <div className="krow" key={i}>
              <input className="kinput" placeholder="الشريحة" value={t.tier} onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, tier: e.target.value } : x))} style={{ width: 110 }} />
              <input className="kinput" type="number" value={t.price} onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} style={{ width: 100 }} />
              <button className="kbtn" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>حذف</button>
            </div>
          ))}
          <button className="kbtn" onClick={() => setTiers([...tiers, { tier: '', price: 0 }])}>+ شريحة</button>
        </>
      )}
      {tab === 'units' && (
        <>
          {units.map((u, i) => (
            <div className="krow" key={i}>
              <input className="kinput" placeholder="الوحدة (كرتونة…)" value={u.unit} onChange={(e) => setUnits(units.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} style={{ width: 130 }} />
              <input className="kinput" type="number" title="المعامل" value={u.factor} onChange={(e) => setUnits(units.map((x, j) => j === i ? { ...x, factor: Number(e.target.value) } : x))} style={{ width: 80 }} />
              <input className="kinput" type="number" title="السعر" value={u.price} onChange={(e) => setUnits(units.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} style={{ width: 100 }} />
              <button className="kbtn" onClick={() => setUnits(units.filter((_, j) => j !== i))}>حذف</button>
            </div>
          ))}
          <button className="kbtn" onClick={() => setUnits([...units, { unit: '', factor: 1, price: 0 }])}>+ وحدة فرعية</button>
        </>
      )}
      {tab === 'tax' && (
        <div className="krow">
          <span className="klabel">نسبة الضريبة %</span><input className="kinput" type="number" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: Number(e.target.value) })} style={{ width: 110 }} />
        </div>
      )}
      {tab === 'inventory' && (
        <div className="krow">
          <span className="klabel">رصيد افتتاحي</span><input className="kinput" type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} style={{ width: 110 }} />
        </div>
      )}
      {tab === 'options' && <div className="kpanel">خيارات إضافية للصنف — تُحفظ مع البطاقة.</div>}
    </Modal>
  );
}
