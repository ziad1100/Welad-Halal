import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../services/api';
import { useCart, cartTotals } from '../store/cart';
import { useAuth } from '../store/auth';
import { useBarcodeScanner, beep } from '../hooks/useBarcodeScanner';
import { useProductLookup } from '../hooks/useProductLookup';
import { ProductLookupPanel } from '../components/product/ProductLookupPanel';
import { CustomerModal } from '../components/pos/CustomerModal';
import { SearchableSelect } from '../components/shared/SearchableSelect';
import { SearchableDatalist } from '../components/shared/SearchableDatalist';
import { lookupReps, lookupCategoriesLocal } from '../services/lookups';
import { ReturnModal } from '../components/pos/ReturnModal';
import { ExpenseModal } from '../components/pos/ExpenseModal';
import { ProductModal } from '../components/product/ProductModal';
import { ReceiptPrinterService } from '../receipt/ReceiptPrinterService';
import { orderToReceipt, type PrintStatus } from '../receipt/types';
import { loadPrinterConfig } from '../receipt/configStore';
import { buildReceiptText, type StyledLine } from '../receipt/ReceiptTemplate';
import { ReceiptPreview } from '../receipt/Preview';
import { StartShiftModal, EndShiftModal, type ShiftInfo } from '../components/pos/ShiftModals';
import { useCustomerDisplay, type DisplaySnapshot } from '../store/display';
import { enqueueOrder, flushQueue, isOfflineQueueAvailable, offlineCounts } from '../offline/bridge';
import { useDir } from '../store/lang';
import { useSettings } from '../store/settings';

const PINS_KEY = 'kstore_pins';
function loadPins(): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || '[]'); } catch { return []; }
}

/** §2 — open the Customer Display: Electron second-monitor BrowserWindow via
 * IPC when running in the desktop shell, browser popup otherwise. */
function openCustomerDisplayWindow() {
  const bridge = (window as any).desktopBridge;
  if (bridge?.openCustomerDisplay) { void bridge.openCustomerDisplay(); return; }
  window.open(`${window.location.origin}${window.location.pathname}#/display`, 'customer_display', 'popup=yes,width=1000,height=700');
}

export function POSPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const dir = useDir();
  const nav = useNavigate();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [showCustomers, setShowCustomers] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showProduct, setShowProduct] = useState(false);
  const [prefillBarcode, setPrefillBarcode] = useState('');
  const [prefillName, setPrefillName] = useState('');
  const [msg, setMsg] = useState<{ t: 'err' | 'ok'; m: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>(loadPins);
  const [showPins, setShowPins] = useState(true);
  const [gridView, setGridView] = useState(false);
  const [fullCols, setFullCols] = useState(true);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [previewLines, setPreviewLines] = useState<StyledLine[] | null>(null);
  const [printStatus, setPrintStatus] = useState<PrintStatus>('idle');
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const catRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ORDER_TYPES = [
    { value: 'PICKUP', label: 'استلام' },
    { value: 'RECEIVE', label: 'استقبال' },
    { value: 'DELIVERY', label: 'توصيل' },
  ];

  // ── §4 shift state: employees must open a shift before using the cashier ──
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [endShiftOpen, setEndShiftOpen] = useState(false);
  const [startShiftOpen, setStartShiftOpen] = useState(false);
  const isCashier = !!user && user.permissionLevel < 50;
  // §4 — cashier session rule: no Cashier screen access until a shift is open.
  // Managers/owners may still open their own shift from the POS header chip,
  // but they are not blocked from the rest of the app.
  useEffect(() => {
    let live = true;
    if (isCashier) {
      api.get('/shifts/me/current').then(({ data }) => { if (live) setShift(data?.shift || null); })
        .catch(() => {}).finally(() => { if (live) setShiftLoading(false); });
    } else {
      setShiftLoading(false);
    }
    return () => { live = false; };
  }, [user?.id, isCashier]);

  useEffect(() => ReceiptPrinterService.onChange(setPrintStatus), []);

  // Offline outbox (§5d): flush on entry + whenever connectivity returns.
  const [queuedCount, setQueuedCount] = useState(0);
  useEffect(() => {
    let live = true;
    async function sync() {
      await flushQueue().catch(() => {});
      if (!live) return;
      try { setQueuedCount((await offlineCounts()).pending); } catch { /* browser */ }
    }
    void sync();
    const onOnline = () => { void sync(); };
    window.addEventListener('online', onOnline);
    return () => { live = false; window.removeEventListener('online', onOnline); };
  }, []);

  const { data: cats } = useQuery({ queryKey: ['cats'], queryFn: async () => (await api.get('/categories')).data });
  const { data: expiring } = useQuery({ queryKey: ['pos-expiring'], queryFn: async () => (await api.get('/inventory/expiring', { params: { days: 14 } })).data, staleTime: 60000 });
  const expiryByProduct: Record<string, number> = {};
  for (const b of expiring || []) {
    if (expiryByProduct[b.productId] === undefined || b.daysLeft < expiryByProduct[b.productId]) expiryByProduct[b.productId] = b.daysLeft;
  }
  const { data: products, refetch: refetchProducts } = useQuery({
    queryKey: ['pos-products', q, cat],
    queryFn: async () => (await api.get('/products', { params: { search: q, categoryId: cat || undefined } })).data,
  });
  // Next order number for the header display.
  const { data: nextOrders, refetch: refetchNext } = useQuery({
    queryKey: ['orders-next'],
    queryFn: async () => (await api.get('/orders', { params: { tab: 'log', take: 1 } })).data,
  });
  const nextOrderNumber = (nextOrders?.[0]?.orderNumber ? Number(nextOrders[0].orderNumber) + 1 : 1);

  // ── §2 unified barcode lookup (cached backend) ──
  const lookup = useProductLookup(lookupCode);

  // ── §2 discount code field (server-authoritative at confirm; live preview) ──
  const [discountCode, setDiscountCode] = useState('');
  const [codeCheck, setCodeCheck] = useState<any | null>(null);
  // §4 — drawer math depends on payment method: only CASH hits the drawer.
  const [payment, setPayment] = useState<'CASH' | 'CARD'>('CASH');
  const codeTimer = useRef<number | undefined>(undefined);
  const totals = cartTotals(cart.lines);
  const discountAmount = codeCheck?.valid ? Number(codeCheck.discountAmount || 0) : 0;
  const payable = Math.max(0, totals.total - discountAmount);

  useEffect(() => {
    window.clearTimeout(codeTimer.current);
    const code = discountCode.trim();
    if (!code || !cart.lines.length) { setCodeCheck(null); return; }
    codeTimer.current = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/discount-codes/preview', { params: { code, subtotal: totals.total } });
        setCodeCheck(data);
      } catch { setCodeCheck(null); }
    }, 350);
    return () => window.clearTimeout(codeTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountCode, cart.lines.length, totals.total]);

  // ── §2 customer display mirror: publish the live cart to mirror windows ──
  // Controlled by the customer_display_enabled Administration toggle (not by
  // role): cashiers are the ones scanning, so their sessions must mirror too.
  const { customerDisplayEnabled, loadPublic } = useSettings();
  useEffect(() => { void loadPublic(); }, [loadPublic]);
  useEffect(() => {
    if (!customerDisplayEnabled) return;
    const pub = useCustomerDisplay.getState().publish;
    const snap: DisplaySnapshot = {
      lines: cart.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
      units: totals.units,
      total: payable,
      customerName: cart.customerName,
      orderType: cart.orderType,
      updatedAt: Date.now(),
    };
    pub(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.lines, totals.units, payable, cart.customerName, cart.orderType, customerDisplayEnabled]);

  function flash(t: 'err' | 'ok', m: string) { setMsg({ t, m }); setTimeout(() => setMsg(null), 4000); }

  function addToCart(p: any, qty = 1) {
    cart.add({ productId: p.id, name: p.nameAr || p.name, category: p.category?.nameAr || p.category?.name || '', barcode: p.barcode || '', tier: 'قطاعي', unitPrice: Number(p.retailPrice), quantity: qty, stock: p.inventory ? Number(p.inventory.quantity) : undefined, time: new Date().toLocaleTimeString('ar-EG') });
    setLastAdded(p.id);
  }

  function openNewProduct(code: string, name = '') {
    setPrefillBarcode(code);
    setPrefillName(name);
    setShowProduct(true);
  }

  async function handleScan(code: string) {
    // Set lookupCode so the ProductLookupPanel can display the record
    setLookupCode(code);
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      if (data?.id) { addToCart(data); beep(true); flash('ok', `تمت إضافة ${data.nameAr || data.name}`); setLookupCode(null); return; }
    } catch { /* fall through to external lookup */ }
    // Not in DB → try external barcode API
    try {
      const { data } = await api.get(`/barcode/${encodeURIComponent(code)}`);
      if (data?.found) { addToCart(data.product); beep(true); flash('ok', `تمت إضافة ${data.product.nameAr || data.product.name}`); setLookupCode(null); return; }
      beep(false);
      openNewProduct(code, data?.suggestion?.name || '');
      if (data?.suggestion?.name) flash('ok', `بيانات مقترحة من قاعدة خارجية: ${data.suggestion.name}`);
    } catch { openNewProduct(code); }
    setLookupCode(null);
  }
  useBarcodeScanner(handleScan);

  function togglePin(id: string) {
    const next = pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
    setPins(next);
    localStorage.setItem(PINS_KEY, JSON.stringify(next));
  }

  /** Scanner fast-entry: digits-only input goes straight to the barcode lookup
   * flow (existing product → cart, unknown → New Product modal pre-filled);
   * free text goes to the fuzzy product search. */
  const BARCODE_PATTERN = /^[\d\-+]{4,}$/;
  async function lookupBarcode(code: string) {
    setLookupCode(code);
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      if (data?.id) { addToCart(data); beep(true); setQ(''); setLookupCode(null); return; }
    } catch { /* fall through to external lookup */ }
    try {
      const { data } = await api.get(`/barcode/${encodeURIComponent(code)}`);
      if (data?.found) { addToCart(data.product); beep(true); setQ(''); setLookupCode(null); return; }
      beep(false);
      openNewProduct(code, data?.suggestion?.name || '');
      if (data?.suggestion?.name) flash('ok', `بيانات مقترحة من قاعدة خارجية: ${data.suggestion.name}`);
    } catch { openNewProduct(code); }
    setLookupCode(null);
  }

  async function searchBarcode() {
    const code = q.trim();
    if (!code) { refetchProducts(); return; }
    if (BARCODE_PATTERN.test(code)) { await lookupBarcode(code); return; }
    // Plain text → fuzzy search results in the catalog table.
    refetchProducts();
  }

  async function submit(status: 'HELD' | 'CONFIRMED') {
    if (busy) return; // idempotency: rapid F12 double-press yields one order
    if (!cart.lines.length) { flash('err', 'حدث خطأ أثناء حفظ الطلب — السلة فارغة'); return; }
    if (isCashier && !shift) { flash('err', 'ابدأ الشيفت أولاً قبل تأكيد الطلبات'); return; }
    setBusy(true);
    const payload = {
      orderType: cart.orderType,
      status: status === 'HELD' ? 'HELD' : 'CONFIRMED',
      customerId: cart.customerId || undefined,
      deliveryRepId: cart.orderType === 'DELIVERY' ? cart.deliveryRepId || undefined : undefined,
      discountCode: discountCode.trim() || undefined,
      paymentMethod: payment,
      items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    };
    try {
      const { data } = await api.post('/orders', payload);
      if (status === 'HELD') {
        flash('ok', `تم تعليق الفاتورة رقم ${data.orderNumber}`);
      } else {
        // Order saved first — printing only after successful confirmation.
        setLastOrder(data);
        flash('ok', `تم تأكيد الطلب رقم ${data.orderNumber} — الإجمالي ${Number(data.total)}`);
        const cfg = loadPrinterConfig();
        if (cfg.autoPrint) {
          const ok = await ReceiptPrinterService.printReceipt(orderToReceipt(data, false), cfg);
          if (!ok) flash('err', `${ReceiptPrinterService.lastError} — الطلب محفوظ برقم ${data.orderNumber} (إعادة المحاولة من طباعة نسخة)`);
        }
        if (cfg.openCashDrawer) ReceiptPrinterService.kickDrawer(cfg);
      }
      cart.clear();
      setDiscountCode(''); setCodeCheck(null);
      setPayment('CASH');
      refetchNext();
      // Piggyback a flush + counter refresh on every successful submit.
      void flushQueue().then(() => offlineCounts().then((c) => setQueuedCount(c.pending)).catch(() => {})).catch(() => {});
    } catch (e: any) {
      // Offline-first (§5d): no HTTP response + desktop shell present →
      // queue the order locally instead of losing the sale. The outbox sends
      // a stable Idempotency-Key, so sync can never create a duplicate.
      if (!e?.response && isOfflineQueueAvailable()) {
        try {
          const queued = await enqueueOrder(payload);
          flash('ok', `انقطع الاتصال — حُفظ الطلب في طابور المزامنة (${queued.pending} معلق)، سيُرسل تلقائياً`);
          setQueuedCount(queued.pending);
          cart.clear();
          setDiscountCode(''); setCodeCheck(null);
          setPayment('CASH');
          return;
        } catch { /* fall through to the error below */ }
      }
      flash('err', apiError(e, 'حدث خطأ أثناء حفظ الطلب'));
    }
    finally { setBusy(false); }
  }

  async function printCopy() {
    if (printStatus === 'printing') return;
    if (!lastOrder) { flash('err', 'لا توجد فاتورة للطباعة'); return; }
    // COPY ONLY: same number, same totals, no order, no deduction.
    const ok = await ReceiptPrinterService.printReceipt(orderToReceipt(lastOrder, true));
    if (!ok) flash('err', `${ReceiptPrinterService.lastError} — (إعادة المحاولة متاحة)`);
    else flash('ok', `تم إرسال نسخة الفاتورة رقم ${lastOrder.orderNumber} للطباعة`);
  }

  async function kickDrawer() {
    const ok = await ReceiptPrinterService.kickDrawer();
    flash(ok ? 'ok' : 'err', ok ? 'تم إرسال أمر فتح الدرج' : 'فتح الدرج غير مدعوم في المتصفح — يعمل مع طابعة حرارية عبر Electron');
  }

  // keyboard shortcuts §70
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') { e.preventDefault(); setShowCustomers(true); }
      else if (e.key === 'F4') { e.preventDefault(); catRef.current?.focus(); }
      else if (e.key === 'F9') { e.preventDefault(); submit('HELD'); }
      else if (e.key === 'F12') { e.preventDefault(); submit('CONFIRMED'); }
      else if (e.key === 'Escape') { setShowCustomers(false); setShowProduct(false); setShowReturn(false); setShowExpense(false); setStartShiftOpen(false); setEndShiftOpen(false); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.lines, cart.customerId, cart.orderType, discountCode]);

  const shiftChip = shift ? (
    <span className="kstatus" style={{ background: 'var(--k-total-green)', color: '#fff', borderColor: 'transparent' }}>
      شيفت مفتوح منذ {new Date(shift.startedAt).toLocaleTimeString('ar-EG')}
      <button className="kbtn" style={{ marginRight: 6, padding: '0 8px', fontSize: 11, color: '#fff', background: 'rgba(0,0,0,.25)', borderColor: 'transparent' }}
        onClick={() => setEndShiftOpen(true)}>إنهاء الشيفت</button>
    </span>
  ) : (
    <span className="kstatus">
      لا يوجد شيفت مفتوح
      <button className="kbtn" style={{ marginRight: 6, padding: '0 8px', fontSize: 11 }} onClick={() => setStartShiftOpen(true)}>بدء الشيفت</button>
    </span>
  );

  // §4 — cashier session rule: the Cashier screen is unusable until a shift
  // is open. Managers/owners see the shift chip but are not blocked.
  if (isCashier && shiftLoading) {
    return <div className="kpanel" style={{ padding: 16 }}>جاري التحقق من الشيفت…</div>;
  }
  if (isCashier && !shift) {
    // No skip path for employees — the drawer must be opened before checkout.
    return <StartShiftModal onStarted={(s) => setShift(s)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} dir={dir}>
      {/* POS header — green order-data bar */}
      <div className="pos-header">
        <button className="kbtn" onClick={() => setShowCustomers(true)} title="F2">اختيار عميل (F2)</button>
        <button className="kbtn" onClick={() => cart.setCustomer(null, 'عميل نقدي', 0)}>عميل نقدي</button>
        <SearchableDatalist label="نوع الطلب:" value={cart.orderType}
          options={ORDER_TYPES} placeholder="اكتب أو اختر نوع الطلب…"
          onChange={(v) => { if (v === 'PICKUP' || v === 'RECEIVE' || v === 'DELIVERY') cart.setOrderType(v); }} />
        {cart.orderType === 'DELIVERY' && (
          <SearchableSelect label="المندوب:" value={cart.deliveryRepId || ''} loadOptions={lookupReps()}
            placeholder="اكتب أو اختر المندوب…" onChange={(v) => cart.setDeliveryRep(v || null)} />
        )}
        <span>رقم الطلب: <b>{nextOrderNumber}</b></span>
        <span>الكاشير: <b>{user?.username}</b>{isCashier && shift && <span className="kstatus" style={{ marginLeft: 6 }}>&#160؛&#160;شيفت نشط</span>}</span>
        <span>العميل: <b>{cart.customerName}</b>{cart.customerId && cart.customerBalance > 0 && <span className="kstatus">رصيد آجل: {cart.customerBalance} ج.م</span>}</span>
        <span style={{ flex: 1 }} />
        {queuedCount > 0 && isOfflineQueueAvailable() && (
          <span className="kstatus" title="طلبات محفوظة محلياً ستُرسل تلقائياً عند عودة الاتصال">📥 طابور المزامنة: {queuedCount}</span>
        )}
        {shiftChip}
      </div>

      {/* search row — cream catalog filter bar */}
      <div className="pos-searchbar">
        <button className="kbtn" title="التصنيفات المثبتة (F4)" onClick={() => catRef.current?.focus()}>📌 تصنيفات مثبتة (F4)</button>
        <button className="kbtn" title={showPins ? 'إخفاء المثبتة' : 'إظهار المثبتة'} onClick={() => setShowPins(!showPins)}>{showPins ? '👁' : '👁‍🗨'}</button>
        <button className="kbtn" title="عرض الكل" onClick={() => { setCat(''); setQ(''); }}>الكل</button>
        <span className="klabel">بحث:</span>
        <input ref={searchRef} className="kinput" placeholder="🔍 باركود / اسم صنف — Enter للبحث" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') searchBarcode(); }} style={{ width: 300 }} />
        <SearchableSelect value={cat} loadOptions={lookupCategoriesLocal(cats || [])} inputRef={catRef}
          placeholder="كل التصنيفات — اكتب للبحث…" onChange={(v) => setCat(v)} />
        {cat && <button className="kbtn" title={pins.includes(cat) ? 'إلغاء التثبيت' : 'تثبيت هذا التصنيف'} onClick={() => togglePin(cat)}>📌</button>}
        <button className="kbtn" title="تبديل عرض شبكي/جدول" onClick={() => setGridView(!gridView)}>{gridView ? '📋' : '⊞'}</button>
        <button className="kbtn" title="مسح باركود (التركيز على البحث)" onClick={() => searchRef.current?.focus()}>📷</button>
        <button className="kbtn" onClick={() => setFullCols(!fullCols)}>تعديل العرض</button>
        <button className="kbtn kbtn-primary" onClick={searchBarcode}>بحث</button>
        <button className="kbtn" onClick={openCustomerDisplayWindow}>🖥 شاشة العرض</button>
      </div>

      {/* pinned quick categories (F4) */}
      {showPins && !!(cats || []).length && (
        <div className="krow" style={{ padding: '0 8px 4px' }}>
          {(cats || []).filter((c: any) => pins.includes(c.id)).map((c: any) => (
            <button key={c.id} className="kbtn" style={cat === c.id ? { background: 'var(--k-selected)', color: '#fff' } : {}} onClick={() => setCat(cat === c.id ? '' : c.id)}>
              {c.nameAr || c.name}
            </button>
          ))}
          {!pins.length && <span style={{ color: 'var(--muted)', fontSize: 12 }}>لا توجد تصنيفات مثبتة — اختر من القائمة ثم 📌</span>}
        </div>
      )}

      {msg && <div className={msg.t === 'err' ? 'kerr' : 'kok'} style={{ margin: '0 8px' }}>{msg.m}</div>}

      {/* §2 — unified barcode lookup panel: shows full product record on scan/search */}
      {lookupCode && lookup.data && (
        <div style={{ padding: '0 8px 4px' }}>
          <ProductLookupPanel
            code={lookupCode}
            mode="cashier"
            onAddToCart={(p) => { addToCart(p); setLookupCode(null); }}
            onClose={() => setLookupCode(null)}
          />
        </div>
      )}

      <div className="pos-stack" style={{ display: 'flex', gap: 6, padding: 6, flex: 1, minHeight: 0, minWidth: 0 }}>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, minWidth: 0 }}>
          {/* product results §24 */}
          <div className="ktable-wrap" style={{ flex: 1 }}>
            {!gridView ? (
            <table className="ktable">
              <thead><tr><th>التصنيف</th><th>الصنف</th>{fullCols && <th>الوصف</th>}<th>باركود</th>{fullCols && <th>رصيد</th>}<th>قطاعي</th><th></th></tr></thead>
              <tbody>{(products || []).map((p: any) => (
                <tr key={p.id} onClick={() => addToCart(p)} title="اضغط للإضافة إلى السلة">
                  <td>{p.category?.nameAr || p.category?.name || '—'}</td>
                  <td>{p.nameAr || p.name}{expiryByProduct[p.id] !== undefined && <span className="kstatus" title="قارب على الانتهاء — بيع الأقدم أولاً">⏳ {expiryByProduct[p.id]} يوم</span>}</td>
                  {fullCols && <td>{p.description || '—'}</td>}
                  <td>{p.barcode || '—'}</td>{fullCols && <td>{p.inventory ? Number(p.inventory.quantity) : '—'}</td>}<td>{Number(p.retailPrice)}</td>
                  <td><button className="kbtn" onClick={(e) => { e.stopPropagation(); addToCart(p); }}>+ إضافة</button></td>
                </tr>))}</tbody>
            </table>
            ) : (
            <div className="pos-grid">
              {(products || []).map((p: any) => (
                <button key={p.id} className="pos-card" onClick={() => addToCart(p)} title="اضغط للإضافة إلى السلة">
                  <b>{p.nameAr || p.name}</b>
                  <span>{Number(p.retailPrice)} ج.م</span>
                  <small>{p.category?.nameAr || p.category?.name || ''}</small>
                </button>))}
              {!(products || []).length && <div style={{ padding: 16, color: 'var(--muted)' }}>لا نتائج</div>}
            </div>
            )}
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
              <thead><tr><th>التصنيف</th><th>الصنف</th><th>التسعير</th><th>السعر</th><th>الكمية</th><th>السعر الكلي</th><th>الوقت</th><th></th></tr></thead>
              <tbody>{cart.lines.map((l) => (
                <tr key={l.productId} className={lastAdded === l.productId ? 'recent' : ''}>
                  <td>{l.category}</td><td>{l.name}</td><td>{l.tier || 'قطاعي'}</td><td>{l.unitPrice}</td>
                  <td><input className="kinput" type="number" min={0.001} step="any" value={l.quantity} onChange={(e) => cart.setQty(l.productId, Number(e.target.value))} style={{ width: 70 }} /></td>
                  <td><b>{(l.quantity * l.unitPrice).toFixed(2)}</b></td><td>{l.time}</td>
                  <td><button className="kbtn" onClick={() => cart.remove(l.productId)}>حذف</button></td>
                </tr>))}</tbody>
            </table>
            )}
          </div>
        </div>

        {/* totals §26 */}
        <div className="pos-side" style={{ width: 230, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="kpanel">عدد الوحدات: <b>{totals.units}</b></div>
          <div className="kpanel">عدد الأصناف: <b>{totals.items}</b></div>
          <div>إجمالي الفاتورة</div>
          <div className="ktotal-box">{payable.toFixed(2)}</div>
          {discountAmount > 0 && <div className="kok" style={{ fontSize: 12 }}>الخصم: -{discountAmount.toFixed(2)} ({codeCheck?.code})</div>}
          {/* §2 — discount code field */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>كود خصم</div>
            <input className="kinput" placeholder="WELAD10" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); }}}
              style={{ width: '100%', boxSizing: 'border-box', textTransform: 'uppercase' }} />
            {discountCode && !codeCheck && <div style={{ fontSize: 11, color: 'var(--muted)' }}>جاري التحقق…</div>}
            {codeCheck && !codeCheck.valid && <div style={{ fontSize: 11, color: '#E5484D' }}>{codeCheck.reason || 'الكود غير صالح'}</div>}
            {codeCheck?.valid && <div style={{ fontSize: 11, color: '#2E9E5B' }}>✓ ساري — خصم {Number(codeCheck.discountAmount).toFixed(2)} ج.م</div>}
          </div>
          {/* §4 — payment method toggle (drives shift drawer reconciliation) */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="kbtn" style={{ flex: 1, fontWeight: payment === 'CASH' ? 700 : 400, borderColor: payment === 'CASH' ? '#2E9E5B' : undefined }}
              onClick={() => setPayment('CASH')}>نقدي</button>
            <button className="kbtn" style={{ flex: 1, fontWeight: payment === 'CARD' ? 700 : 400, borderColor: payment === 'CARD' ? '#F5A623' : undefined }}
              onClick={() => setPayment('CARD')}>بطاقة</button>
          </div>
          {lastOrder && <button className="kbtn" onClick={() => setPreviewLines(buildReceiptText(orderToReceipt(lastOrder, true), loadPrinterConfig(), loadPrinterConfig().paperWidth))}>معاينة الفاتورة</button>}
        </div>
      </div>

      {/* bottom action bar */}
      <div className="pos-actionbar">
        <button className="kbtn" onClick={onBack}>الطلبات</button>
        <button className="kbtn" onClick={() => nav('/purchases')}>المشتريات</button>
        <button className="kbtn" onClick={() => nav('/products')}>الأصناف</button>
        <button className="kbtn" onClick={() => setShowReturn(true)}>مرتجع</button>
        <button className="kbtn" onClick={() => setShowExpense(true)}>المصروفات</button>
        <button className="kbtn" onClick={kickDrawer}>فتح الدرج</button>
        <button className="kbtn" disabled={printStatus === 'printing'} onClick={printCopy}>
          {printStatus === 'printing' ? 'جاري الطباعة…' : 'طباعة نسخة'}
        </button>
        <button className="kbtn" disabled={busy || !cart.lines.length} onClick={() => submit('HELD')}>تعليق الفاتورة (F9)</button>
        <button className="kbtn kbtn-primary" disabled={busy || !cart.lines.length} onClick={() => submit('CONFIRMED')} style={{ padding: '8px 22px' }}>تأكيد (F12)</button>
      </div>

      {showCustomers && <CustomerModal onClose={() => setShowCustomers(false)} onSelect={(c) => { cart.setCustomer(c.id, c.name, Number(c.balance || 0)); setShowCustomers(false); }} />}
      {showReturn && <ReturnModal onClose={() => setShowReturn(false)} onDone={(m) => flash('ok', m)} />}
      {showProduct && <ProductModal barcode={prefillBarcode} initialName={prefillName} onClose={() => { setShowProduct(false); setPrefillName(''); }} onSaved={(p) => { setShowProduct(false); setPrefillName(''); setQ(''); refetchProducts(); if (p) addToCart(p); }} />}
      {showExpense && <ExpenseModal onClose={() => setShowExpense(false)} onDone={(m) => flash('ok', m)} />}
      {previewLines && <ReceiptPreview lines={previewLines} onClose={() => setPreviewLines(null)} />}

      {/* §4 — start/end shift modals (manager path — non-blocking) */}
      {startShiftOpen && !shift && <StartShiftModal onStarted={(s) => { setShift(s); setStartShiftOpen(false); }} onDismiss={() => setStartShiftOpen(false)} dismissLabel="إلغاء" />}
      {endShiftOpen && shift && <EndShiftModal shift={shift} onClose={() => setEndShiftOpen(false)} onClosed={() => { setShift(null); setEndShiftOpen(false); }} />}
    </div>
  );
}
