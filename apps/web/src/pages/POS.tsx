import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';
import { useCart, cartTotals } from '../store/cart';
import { useAuth } from '../store/auth';
import { useBarcodeScanner, beep } from '../hooks/useBarcodeScanner';
import { CustomerModal } from '../components/pos/CustomerModal';
import { ProductModal } from '../components/product/ProductModal';

const PINS_KEY = 'kstore_pins';
function loadPins(): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || '[]'); } catch { return []; }
}

export function POSPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [showCustomers, setShowCustomers] = useState(false);
  const [showProduct, setShowProduct] = useState(false);
  const [prefillBarcode, setPrefillBarcode] = useState('');
  const [prefillName, setPrefillName] = useState('');
  const [msg, setMsg] = useState<{ t: 'err' | 'ok'; m: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>(loadPins);
  const catRef = useRef<HTMLSelectElement>(null);

  const { data: cats } = useQuery({ queryKey: ['cats'], queryFn: async () => (await api.get('/categories')).data });
  const { data: products, refetch: refetchProducts } = useQuery({
    queryKey: ['pos-products', q, cat],
    queryFn: async () => (await api.get('/products', { params: { search: q, categoryId: cat || undefined } })).data,
  });

  const totals = cartTotals(cart.lines);

  function flash(t: 'err' | 'ok', m: string) { setMsg({ t, m }); setTimeout(() => setMsg(null), 4000); }

  function addToCart(p: any, qty = 1) {
    cart.add({ productId: p.id, name: p.nameAr || p.name, category: p.category?.nameAr || p.category?.name || '', barcode: p.barcode || '', unitPrice: Number(p.retailPrice), quantity: qty, stock: p.inventory ? Number(p.inventory.quantity) : undefined, time: new Date().toLocaleTimeString('ar-EG') });
    setLastAdded(p.id);
  }

  function openNewProduct(code: string, name = '') {
    setPrefillBarcode(code);
    setPrefillName(name);
    setShowProduct(true);
  }

  async function handleScan(code: string) {
    try {
      const { data } = await api.get(`/barcode/${encodeURIComponent(code)}`);
      if (data?.found) { addToCart(data.product); beep(true); flash('ok', `تمت إضافة ${data.product.nameAr || data.product.name}`); }
      else {
        beep(false);
        openNewProduct(code, data?.suggestion?.name || '');
        if (data?.suggestion?.name) flash('ok', `بيانات مقترحة من قاعدة خارجية: ${data.suggestion.name}`);
      }
    } catch { openNewProduct(code); }
  }
  useBarcodeScanner(handleScan);

  function togglePin(id: string) {
    const next = pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
    setPins(next);
    localStorage.setItem(PINS_KEY, JSON.stringify(next));
  }

  async function searchBarcode() {
    const code = q.trim();
    if (!code) { refetchProducts(); return; }
    // Exact barcode first (fast path), then fuzzy search
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      if (data) { addToCart(data); beep(true); setQ(''); return; }
    } catch { /* fall through to lookup */ }
    try {
      const { data } = await api.get(`/barcode/${encodeURIComponent(code)}`);
      if (data?.found) { addToCart(data.product); beep(true); setQ(''); return; }
      openNewProduct(code, data?.suggestion?.name || '');
    } catch {
      // unknown barcode → open product modal prefilled
      openNewProduct(code);
    }
  }

  async function submit(status: 'HELD' | 'CONFIRMED') {
    if (!cart.lines.length) { flash('err', 'حدث خطأ أثناء حفظ الطلب — السلة فارغة'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/orders', {
        orderType: cart.orderType,
        status: status === 'HELD' ? 'HELD' : 'CONFIRMED',
        customerId: cart.customerId || undefined,
        items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      });
      flash('ok', status === 'HELD' ? `تم تعليق الفاتورة رقم ${data.orderNumber}` : `تم تأكيد الطلب رقم ${data.orderNumber} — الإجمالي ${Number(data.total)}`);
      cart.clear();
    } catch (e: any) { flash('err', apiError(e)); }
    finally { setBusy(false); }
  }

  // keyboard shortcuts §70
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') { e.preventDefault(); setShowCustomers(true); }
      else if (e.key === 'F4') { e.preventDefault(); catRef.current?.focus(); }
      else if (e.key === 'F9') { e.preventDefault(); submit('HELD'); }
      else if (e.key === 'F12') { e.preventDefault(); submit('CONFIRMED'); }
      else if (e.key === 'Escape') { setShowCustomers(false); setShowProduct(false); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.lines, cart.customerId, cart.orderType]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} dir="rtl">
      {/* POS header §21 */}
      <div style={{ background: 'var(--k-detail-header)', borderBottom: '1px solid var(--k-border)', padding: '4px 8px', display: 'flex', gap: 16 }}>
        <span>نوع الطلب: <select className="kselect" value={cart.orderType} onChange={(e) => cart.setOrderType(e.target.value as any)}>
          <option value="PICKUP">استلام (Pickup)</option><option value="RECEIVE">استقبال (Receive)</option><option value="DELIVERY">توصيل (Delivery)</option>
        </select></span>
        <span>الكاشير: <b>{user?.username}</b></span>
        <span>العميل: <b>{cart.customerName}</b>{cart.customerId && cart.customerBalance > 0 && <span className="kstatus">رصيد آجل: {cart.customerBalance} ج.م</span>}</span>
      </div>

      {/* customer area §22 */}
      <div className="krow" style={{ padding: '4px 8px' }}>
        <button className="kbtn" onClick={() => cart.setCustomer(null, 'عميل نقدي', 0)}>عميل نقدي</button>
        <button className="kbtn" onClick={() => setShowCustomers(true)}>اختيار عميل (F2)</button>
      </div>

      {/* pinned quick categories (F4) */}
      {!!(cats || []).length && (
        <div className="krow" style={{ padding: '0 8px 4px' }}>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>📌 مثبتة (F4):</span>
          {(cats || []).filter((c: any) => pins.includes(c.id)).map((c: any) => (
            <button key={c.id} className="kbtn" style={cat === c.id ? { background: 'var(--k-selected)', color: '#fff' } : {}} onClick={() => setCat(cat === c.id ? '' : c.id)}>
              {c.nameAr || c.name}
            </button>
          ))}
          {!pins.length && <span style={{ color: 'var(--muted)', fontSize: 12 }}>لا توجد تصنيفات مثبتة — اختر من القائمة ثم 📌</span>}
        </div>
      )}

      {/* search §23 */}
      <div className="krow" style={{ padding: '0 8px 4px' }}>
        <input className="kinput" placeholder="باركود / اسم صنف — Enter للبحث" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') searchBarcode(); }} style={{ width: 300 }} />
        <button className="kbtn kbtn-primary" onClick={searchBarcode}>بحث</button>
        <select ref={catRef} className="kselect" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">كل التصنيفات (F4)</option>
          {(cats || []).map((c: any) => <option key={c.id} value={c.id}>{c.nameAr || c.name}</option>)}
        </select>
        {cat && <button className="kbtn" title={pins.includes(cat) ? 'إلغاء التثبيت' : 'تثبيت هذا التصنيف'} onClick={() => togglePin(cat)}>📌</button>}
      </div>

      {msg && <div className={msg.t === 'err' ? 'kerr' : 'kok'} style={{ margin: '0 8px' }}>{msg.m}</div>}

      <div style={{ display: 'flex', gap: 6, padding: 6, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          {/* product results §24 */}
          <div className="ktable-wrap" style={{ flex: 1 }}>
            <table className="ktable">
              <thead><tr><th>التصنيف</th><th>الصنف</th><th>الوصف</th><th>الباركود</th><th>المخزون</th><th>سعر البيع</th><th></th></tr></thead>
              <tbody>{(products || []).map((p: any) => (
                <tr key={p.id} onDoubleClick={() => addToCart(p)}>
                  <td>{p.category?.nameAr || p.category?.name || '—'}</td><td>{p.nameAr || p.name}</td><td>{p.description || '—'}</td>
                  <td>{p.barcode || '—'}</td><td>{p.inventory ? Number(p.inventory.quantity) : '—'}</td><td>{Number(p.retailPrice)}</td>
                  <td><button className="kbtn" onClick={() => addToCart(p)}>+ إضافة</button></td>
                </tr>))}</tbody>
            </table>
          </div>
          {/* cart §25 */}
          <div className="ktable-wrap" style={{ flex: 1 }}>
            {cart.lines.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ fontSize: 28 }}>🧾</div>
                <div>السلة فارغة — ابدأ بمسح باركود أو البحث عن صنف</div>
              </div>
            ) : (
            <table className="ktable">
              <thead><tr><th>التصنيف</th><th>الصنف</th><th>السعر</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الوقت</th><th></th></tr></thead>
              <tbody>{cart.lines.map((l) => (
                <tr key={l.productId} className={lastAdded === l.productId ? 'selected' : ''}>
                  <td>{l.category}</td><td>{l.name}</td><td>{l.unitPrice}</td>
                  <td><input className="kinput" type="number" min={0.001} step="any" value={l.quantity} onChange={(e) => cart.setQty(l.productId, Number(e.target.value))} style={{ width: 70 }} /></td>
                  <td>{l.unitPrice}</td><td><b>{(l.quantity * l.unitPrice).toFixed(2)}</b></td><td>{l.time}</td>
                  <td><button className="kbtn" onClick={() => cart.remove(l.productId)}>حذف</button></td>
                </tr>))}</tbody>
            </table>
            )}
          </div>
        </div>

        {/* totals §26 + actions §27 */}
        <div style={{ width: 230, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="kpanel">عدد الوحدات: <b>{totals.units}</b></div>
          <div className="kpanel">عدد الأصناف: <b>{totals.items}</b></div>
          <div>إجمالي الفاتورة</div>
          <div className="ktotal-box">{totals.total.toFixed(2)}</div>
          <button className="kbtn" onClick={onBack}>الطلبات</button>
          <button className="kbtn" onClick={() => refetchProducts()}>الأصناف</button>
          <button className="kbtn" onClick={() => flash('err', 'المرتجعات من تفاصيل الطلب في سجل الطلبات')}>مرتجع</button>
          <button className="kbtn" onClick={() => flash('err', 'المصروفات من صفحة التقارير/المصروفات')}>مصروفات</button>
          <button className="kbtn" onClick={() => window.print()}>طباعة نسخة</button>
          <button className="kbtn" disabled={busy || !cart.lines.length} onClick={() => submit('HELD')}>تعليق الفاتورة (F9)</button>
          <button className="kbtn kbtn-primary" disabled={busy || !cart.lines.length} onClick={() => submit('CONFIRMED')} style={{ padding: '8px' }}>تأكيد (F12)</button>
        </div>
      </div>

      {showCustomers && <CustomerModal onClose={() => setShowCustomers(false)} onSelect={(c) => { cart.setCustomer(c.id, c.name, Number(c.balance || 0)); setShowCustomers(false); }} />}
      {showProduct && <ProductModal barcode={prefillBarcode} initialName={prefillName} onClose={() => { setShowProduct(false); setPrefillName(''); }} onSaved={(p) => { setShowProduct(false); setPrefillName(''); setQ(''); refetchProducts(); if (p) addToCart(p); }} />}
    </div>
  );
}
