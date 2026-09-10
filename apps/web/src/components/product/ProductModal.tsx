import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../../services/api';
import { Modal } from '../shared/ui';
import { SearchableSelect } from '../shared/SearchableSelect';
import { SearchableDatalist } from '../shared/SearchableDatalist';
import { lookupSuppliers, lookupCategoriesLocal } from '../../services/lookups';
import { useProductLookup } from '../../hooks/useProductLookup';

const TYPES = [
  { v: 'BUNDLED_ITEM', l: 'صنف مجموع' },
  { v: 'RAW_MATERIAL', l: 'خامات' },
  { v: 'SERVICE_ITEM', l: 'صنف خدمي' },
  { v: 'INVENTORY_ITEM', l: 'صنف مخزوني' },
];

const PURCHASE_UNITS = ['قطعة', 'كيلو', 'جرام', 'لتر', 'علبة', 'كرتونة', 'شوال', 'متر'];

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
  // Pricing tab: "تحديث" links the قطاعي tier price to the real retail price.
  const [syncTierPrice, setSyncTierPrice] = useState(true);
  // Purchase unit + default toggle (saved as unit / unitOfMeasure).
  const [defaultUnit, setDefaultUnit] = useState(true);
  // BOM for BUNDLED_ITEM (صنف مجموع): component product + quantity rows.
  const [bom, setBom] = useState<{ productId: string; name: string; quantity: number }[]>([]);
  const [bomSearch, setBomSearch] = useState('');
  const { data: cats } = useQuery({ queryKey: ['cats'], queryFn: async () => (await api.get('/categories')).data });
  const { data: bomResults } = useQuery({
    queryKey: ['bom-search', bomSearch],
    queryFn: async () => (await api.get('/products', { params: { search: bomSearch, take: 10 } })).data,
    enabled: f.productType === 'BUNDLED_ITEM' && bomSearch.trim().length > 1,
  });

  // §2 — new-product-check: verify barcode doesn't already exist
  const existingProduct = useProductLookup(barcode || null);
  const barcodeExists = !!existingProduct.data?.id;

  async function save() {
    setErr('');
    if (!f.name.trim()) { setErr('اسم الصنف مطلوب'); return; }
    if (barcodeExists) { setErr(`الباركود "${barcode}" مسجل مسبقاً للصنف: ${existingProduct.data?.nameAr || existingProduct.data?.name}`); return; }
    if (f.productType === 'BUNDLED_ITEM' && !bom.length) { setErr('الصنف المجموع يحتاج مكونًا واحدًا على الأقل'); return; }
    try {
      const { data } = await api.post('/products', {
        ...f, retailPrice: Number(f.retailPrice), purchasePrice: Number(f.purchasePrice),
        taxRate: Number(f.taxRate), quantity: Number(f.quantity),
        unitOfMeasure: defaultUnit ? f.unit : undefined,
        supplierId: f.supplierId || undefined,
        priceTiers: tiers.filter((t) => t.tier.trim() && t.price > 0),
        subUnits: units.filter((u) => u.unit.trim() && u.factor > 0),
        components: f.productType === 'BUNDLED_ITEM'
          ? bom.filter((b) => b.productId && b.quantity > 0).map((b) => ({ productId: b.productId, quantity: Number(b.quantity) }))
          : undefined,
      });
      onSaved(data);
    } catch (e: any) { setErr(apiError(e)); }
  }

  function setTierPrice(i: number, price: number) {
    setTiers(tiers.map((x, j) => j === i ? { ...x, price } : x));
    // "تحديث": the قطاعي row drives the real retail price.
    if (syncTierPrice && i === 0) setF((prev) => ({ ...prev, retailPrice: price }));
  }

  return (
    <Modal title="بيانات صنف" onClose={onClose} modalClass="product-modal" footer={<><button className="kbtn kbtn-primary" onClick={save} disabled={barcodeExists}>💾 حفظ</button><button className="kbtn" onClick={onClose}>إلغاء (ESC)</button></>}>
      {err && <div className="kerr">{err}</div>}
      {barcodeExists && (
        <div style={{ padding: '6px 10px', background: '#FFF3CD', borderRadius: 4, marginBottom: 8, fontSize: 12 }}>
          ⚠ هذا الباركود مسجل مسبقاً للصنف: <b>{existingProduct.data?.nameAr || existingProduct.data?.name}</b>
          ({existingProduct.data?.barcode}) — لا يمكن تسجيل منتج آخر بنفس الباركود.
        </div>
      )}
      {/* item-type radio group — drives relevant fields (BOM for bundles) */}
      <div className="krow" role="radiogroup" aria-label="نوع الصنف">
        <span className="klabel">النوع:</span>
        {TYPES.map((t) => (
          <label key={t.v} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginInlineEnd: 10 }}>
            <input type="radio" name="product-type" checked={f.productType === t.v} onChange={() => setF({ ...f, productType: t.v })} />
            {t.l}
          </label>
        ))}
      </div>
      <div className="krow">
        <span className="klabel">اسم الصنف *</span>
        <input className="kinput product-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, nameAr: e.target.value })} style={{ width: 220 }} />
        <span className="klabel">وحدة الشراء</span>
        <SearchableDatalist value={f.unit} options={PURCHASE_UNITS.map((u) => ({ value: u, label: u }))}
          placeholder="اكتب أو اختر الوحدة…" onChange={(v) => setF({ ...f, unit: v })} />
        <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={defaultUnit} onChange={(e) => setDefaultUnit(e.target.checked)} />
          وحدة شراء افتراضية
        </label>
      </div>
      <div className="krow">
        <span className="klabel">الباركود</span>
        <input className="kinput product-barcode" value={f.barcode} dir="ltr" readOnly={!!barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} />
        <span className="klabel">كود المورد</span><input className="kinput" value={f.supplierCode} onChange={(e) => setF({ ...f, supplierCode: e.target.value })} style={{ width: 110 }} />
      </div>
      {f.productType === 'BUNDLED_ITEM' && (
        <div className="kpanel" style={{ marginBottom: 8 }}>
          <b>مكونات الصنف المجموع (BOM)</b>
          <div className="krow" style={{ marginTop: 6 }}>
            <input className="kinput" placeholder="بحث عن مكون…" value={bomSearch} onChange={(e) => setBomSearch(e.target.value)} style={{ flex: 1 }} />
          </div>
          {!!bomSearch.trim() && (bomResults || []).length > 0 && (
            <div className="ktable-wrap" style={{ marginBottom: 6 }}><table className="ktable">
              <tbody>{(bomResults || []).filter((p: any) => !bom.some((b) => b.productId === p.id)).slice(0, 5).map((p: any) => (
                <tr key={p.id}>
                  <td>{p.nameAr || p.name}</td>
                  <td><button className="kbtn" onClick={() => { setBom([...bom, { productId: p.id, name: p.nameAr || p.name, quantity: 1 }]); setBomSearch(''); }}>+ إضافة</button></td>
                </tr>))}
              </tbody>
            </table></div>
          )}
          {bom.map((b, i) => (
            <div className="krow" key={b.productId}>
              <span style={{ flex: 1 }}>{b.name}</span>
              <span className="klabel">الكمية</span>
              <input className="kinput" type="number" min={0.001} step="any" value={b.quantity}
                onChange={(e) => setBom(bom.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} style={{ width: 90 }} />
              <button className="kbtn" onClick={() => setBom(bom.filter((_, j) => j !== i))}>حذف</button>
            </div>
          ))}
          {!bom.length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>أضف مكونًا واحدًا على الأقل — البيع يخصم المكونات من المخزون.</div>}
        </div>
      )}
      <div className="krow">
        <SearchableSelect label="التصنيف" value={f.categoryId} loadOptions={lookupCategoriesLocal(cats || [])}
          placeholder="اكتب أو اختر التصنيف…" onChange={(v) => setF({ ...f, categoryId: v })} />
        <SearchableSelect label="المورد" value={f.supplierId} loadOptions={lookupSuppliers()}
          placeholder="اكتب أو اختر المورد…" onChange={(v) => setF({ ...f, supplierId: v })} />
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
              <input className="kinput" type="number" value={t.price} onChange={(e) => setTierPrice(i, Number(e.target.value))} style={{ width: 100 }} />
              {i === 0 && (
                <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
                  <input type="checkbox" checked={syncTierPrice} onChange={(e) => setSyncTierPrice(e.target.checked)} />
                  تحديث
                </label>
              )}
              {i > 0 && <button className="kbtn" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>حذف</button>}
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
