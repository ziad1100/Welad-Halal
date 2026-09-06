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

export function ProductModal({ barcode, onClose, onSaved }: { barcode?: string; onClose: () => void; onSaved: (p: any) => void }) {
  const [tab, setTab] = useState('pricing');
  const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', nameAr: '', unit: 'قطعة', barcode: barcode || '', supplierCode: '', description: '', retailPrice: 0, purchasePrice: 0, quantity: 0, productType: 'INVENTORY_ITEM', categoryId: '' });
  const { data: cats } = useQuery({ queryKey: ['cats'], queryFn: async () => (await api.get('/categories')).data });

  async function save() {
    setErr('');
    try {
      const { data } = await api.post('/products', { ...f, retailPrice: Number(f.retailPrice), purchasePrice: Number(f.purchasePrice), quantity: Number(f.quantity) });
      onSaved(data);
    } catch (e: any) { setErr(apiError(e)); }
  }

  return (
    <Modal title="بيانات صنف" onClose={onClose} footer={<><button className="kbtn kbtn-primary" onClick={save}>حفظ</button><button className="kbtn" onClick={onClose}>إلغاء (ESC)</button></>}>
      {err && <div className="kerr">{err}</div>}
      <div className="krow">
        {TYPES.map((t) => (
          <label key={t.v} style={{ display: 'flex', gap: 4, alignItems: 'center', border: '1px solid var(--k-border)', padding: '2px 8px', background: f.productType === t.v ? '#fff' : '#eee' }}>
            <input type="radio" checked={f.productType === t.v} onChange={() => setF({ ...f, productType: t.v })} /> {t.l}
          </label>
        ))}
      </div>
      <div className="krow">
        <span className="klabel">اسم الصنف</span><input className="kinput" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, nameAr: e.target.value })} style={{ width: 220 }} />
        <span className="klabel">الوحدة</span><input className="kinput" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} style={{ width: 90 }} />
      </div>
      <div className="krow">
        <span className="klabel">الباركود</span><input className="kinput" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} style={{ width: 160 }} />
        <span className="klabel">كود المورد</span><input className="kinput" value={f.supplierCode} onChange={(e) => setF({ ...f, supplierCode: e.target.value })} style={{ width: 120 }} />
      </div>
      <div className="krow">
        <span className="klabel">التصنيف</span>
        <select className="kselect" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
          <option value="">—</option>
          {(cats || []).map((c: any) => <option key={c.id} value={c.id}>{c.nameAr || c.name}</option>)}
        </select>
        <span className="klabel">الوصف</span><input className="kinput" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ width: 220 }} />
      </div>
      <div className="ktabs">
        {['pricing|التسعير', 'units|الوحدات', 'tax|الضريبة', 'inventory|المخزون', 'options|خيارات'].map((t) => {
          const [v, l] = t.split('|');
          return <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>{l}</button>;
        })}
      </div>
      {tab === 'pricing' && (
        <div className="krow">
          <span className="klabel">سعر البيع</span><input className="kinput" type="number" value={f.retailPrice} onChange={(e) => setF({ ...f, retailPrice: Number(e.target.value) })} style={{ width: 110 }} />
          <span className="klabel">سعر الشراء</span><input className="kinput" type="number" value={f.purchasePrice} onChange={(e) => setF({ ...f, purchasePrice: Number(e.target.value) })} style={{ width: 110 }} />
        </div>
      )}
      {tab === 'inventory' && (
        <div className="krow">
          <span className="klabel">رصيد افتتاحي</span><input className="kinput" type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} style={{ width: 110 }} />
        </div>
      )}
      {tab !== 'pricing' && tab !== 'inventory' && <div className="kpanel">تُحفظ هذه البيانات مع الصنف في قاعدة البيانات عند توفرها.</div>}
    </Modal>
  );
}
