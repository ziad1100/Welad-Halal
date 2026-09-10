import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const baseURL = (import.meta as any).env?.VITE_API_URL || '/api';

/** §1 — public no-login order page. Reachable ONLY via the unique non-sequential
 * token printed in the receipt QR (order numbers are never guessable here).
 * Shows the order details read-only + an optional 1–5 star rating. */
export function PublicOrderPage({ standalone }: { standalone?: boolean }) {
  const { token } = useParams();
  const [order, setOrder] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Standalone (QR link from a receipt): the customer never needs the POS chrome.
  useEffect(() => {
    if (standalone) { try { document.title = 'ولاد حلال — تفاصيل فاتورتك'; } catch { /* ignore */ } }
  }, [standalone]);

  useEffect(() => {
    if (!token) return;
    axios.get(`${baseURL}/public/orders/${encodeURIComponent(token)}`)
      .then(({ data }) => { setOrder(data); setRating(Number(data.rating) || 0); })
      .catch((e: any) => setErr(e?.response?.data?.message || 'الطلب غير موجود'));
  }, [token]);

  async function submitRating() {
    if (!(rating >= 1 && rating <= 5)) return;
    setBusy(true);
    try {
      await axios.post(`${baseURL}/public/orders/${encodeURIComponent(token!)}/rating`, { rating, note });
      setSaved(true);
    } catch (e: any) { setErr(e?.response?.data?.message || 'تعذر حفظ التقييم'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: '100%', background: '#04101f', color: '#fff', display: 'flex', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #F5A623', paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 30, fontWeight: 900 }}><span style={{ color: '#F5A623' }}>ولاد حلال</span></div>
          <div style={{ color: '#9fb3c8', marginTop: 4 }}>تفاصيل فاتورتك</div>
        </div>

        {err && <div style={{ background: '#3A1D1D', color: '#FFB4AB', border: '1px solid #E5484D', padding: 12, borderRadius: 8 }}>{err}</div>}

        {!order && !err && <div style={{ textAlign: 'center', color: '#9fb3c8', padding: 40 }}>جاري تحميل الفاتورة…</div>}

        {order && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,.05)', padding: '10px 14px', borderRadius: 8, marginBottom: 10 }}>
              <span>فاتورة رقم: <b>#{order.orderNumber}</b></span>
              <span>{new Date(order.createdAt).toLocaleString('ar-EG')}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,.05)', padding: '10px 14px', borderRadius: 8, marginBottom: 10 }}>
              العميل: {order.customerName}
            </div>

            {(order.items || []).map((i: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', gap: 10, padding: '8px 4px', borderBottom: '1px dashed rgba(255,255,255,.15)' }}>
                <span style={{ width: 50, color: '#F5A623' }}>{Number(i.quantity)}x</span>
                <span style={{ flex: 1 }}>{i.name}</span>
                <span>{Number(i.lineTotal).toFixed(2)} ج.م</span>
              </div>
            ))}

            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,.05)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>المجموع الفرعي</span><span>{Number(order.subtotal).toFixed(2)}</span></div>
              {Number(order.discount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>الخصم</span><span style={{ color: '#7CE7A3' }}>-{Number(order.discount).toFixed(2)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 22, fontWeight: 800 }}><span>الإجمالي</span><span style={{ color: '#F5A623' }}>{Number(order.total).toFixed(2)} ج.م</span></div>
            </div>

            {/* 1–5 star rating widget */}
            {!saved ? (
              <div style={{ marginTop: 20, background: 'rgba(255,255,255,.05)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>قيّم تجربتك معنا</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, fontSize: 34, cursor: 'pointer' }} dir="ltr">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                      onClick={() => setRating(n)}
                      style={{ filter: n <= (hover || rating) ? 'none' : 'grayscale(1) opacity(.4)' }}>★</span>
                  ))}
                </div>
                <textarea className="kinput" dir="rtl" placeholder="ملاحظات اختيارية…" value={note}
                  onChange={(e) => setNote(e.target.value)} rows={2}
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, background: 'rgba(255,255,255,.06)', color: '#fff', borderColor: 'rgba(255,255,255,.2)' }} />
                <button className="kbtn" disabled={busy || !(rating >= 1)} onClick={submitRating}
                  style={{ marginTop: 10, background: '#F5A623', color: '#04101f', fontWeight: 700, borderColor: 'transparent' }}>
                  {busy ? '...' : 'إرسال التقييم'}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 20, textAlign: 'center', background: '#123324', color: '#7FE0A0', padding: 14, borderRadius: 12, fontWeight: 700 }}>
                شكراً لتقييمك! 🌟
              </div>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', color: '#5c6b7a', fontSize: 12, marginTop: 24 }}>شكراً لتسوقك من ولاد حلال</div>
      </div>
    </div>
  );
}
