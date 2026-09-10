import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../../services/api';
import { Modal } from '../shared/ui';
import { ReceiptPrinterService } from '../../receipt/ReceiptPrinterService';
import { orderToReturnReceipt } from '../../receipt/types';

/** In-POS returns flow: find a confirmed order → pick lines/qtys → real stock-increase + refund. */
export function ReturnModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [search, setSearch] = useState('');
  const [orderId, setOrderId] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ['return-search', search],
    queryFn: async () => (await api.get('/orders', { params: { tab: 'log', search: search || undefined, take: 20 } })).data,
    enabled: search.trim().length > 0,
  });
  const eligible = (orders || []).filter((o: any) => o.status === 'CONFIRMED' || o.status === 'COMPLETED');

  const { data: detail } = useQuery({
    queryKey: ['return-detail', orderId],
    queryFn: async () => (await api.get(`/orders/${orderId}`)).data,
    enabled: !!orderId,
  });

  function toggle(lineId: string, max: number) {
    setChecked((s) => {
      const next = { ...s, [lineId]: !s[lineId] };
      if (next[lineId]) setQty((q) => ({ ...q, [lineId]: q[lineId] || max }));
      return next;
    });
  }

  async function submit() {
    if (!detail) return;
    const lines = (detail.items || []).filter((l: any) => checked[l.id]);
    if (!lines.length) { setErr('اختر بندًا واحدًا على الأقل'); return; }
    const items = lines.map((l: any) => ({ orderItemId: l.id, quantity: Math.min(Number(qty[l.id]) || 0, Number(l.quantity)) }))
      .filter((x: any) => x.quantity > 0);
    if (!items.length) { setErr('أدخل كمية صحيحة للمرتجع'); return; }
    const allFull = items.length === (detail.items || []).length &&
      items.every((x: any) => {
        const l = (detail.items || []).find((y: any) => y.id === x.orderItemId);
        return l && Number(x.quantity) >= Number(l.quantity);
      });
    setErr(''); setBusy(true);
    try {
      const { data } = await api.post(`/orders/${detail.id}/return-request`, allFull ? {} : { items });
      if (data?.pendingApproval) {
        onDone(`المرتجع يتجاوز حد الموافقة — أُرسل للمدير/المالك`);
      } else {
        const ok = await ReceiptPrinterService.printReceipt(orderToReturnReceipt(data || detail, false));
        onDone(ok ? `تم المرتجع — طُبع إيصال مرتجع` : `اكتمل المرتجع (تعذر الطباعة التلقائية)`);
      }
      onClose();
    } catch (e: any) { setErr(apiError(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="مرتجع — بحث عن طلب مؤكد" onClose={onClose} footer={<>
      <button className="kbtn kbtn-primary" disabled={busy || !detail} onClick={submit}>تنفيذ المرتجع</button>
      <button className="kbtn" onClick={onClose}>إلغاء</button>
    </>}>
      {err && <div className="kerr">{err}</div>}
      {!orderId && (
        <>
          <div className="krow">
            <span className="klabel">بحث برقم/عميل</span>
            <input className="kinput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم الطلب أو اسم العميل" style={{ width: 240 }} />
          </div>
          <div className="ktable-wrap"><table className="ktable">
            <thead><tr><th>رقم الطلب</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th><th></th></tr></thead>
            <tbody>{eligible.map((o: any) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td><td>{o.customer?.name || 'عميل نقدي'}</td>
                <td>{Number(o.total)}</td><td>{o.status}</td>
                <td><button className="kbtn" onClick={() => { setOrderId(o.id); setChecked({}); setQty({}); }}>اختيار</button></td>
              </tr>))}
            </tbody>
          </table></div>
          {search.trim().length > 0 && !eligible.length && <div style={{ color: 'var(--muted)', fontSize: 12 }}>لا توجد طلبات مؤكدة مطابقة</div>}
        </>
      )}
      {orderId && detail && (
        <>
          <div className="krow">
            <span>طلب رقم <b>{detail.orderNumber}</b> — الإجمالي <b>{Number(detail.total)}</b></span>
            <button className="kbtn" onClick={() => { setOrderId(''); }}>بحث آخر</button>
          </div>
          <div className="ktable-wrap"><table className="ktable">
            <thead><tr><th></th><th>الصنف</th><th>الكمية</th><th>كمية المرتجع</th></tr></thead>
            <tbody>{(detail.items || []).map((l: any) => (
              <tr key={l.id}>
                <td><input type="checkbox" checked={!!checked[l.id]} onChange={() => toggle(l.id, Number(l.quantity))} /></td>
                <td>{l.productNameSnapshot}</td><td>{Number(l.quantity)}</td>
                <td>{checked[l.id] && (
                  <input className="kinput" type="number" min={0.001} max={Number(l.quantity)} step="any"
                    value={qty[l.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [l.id]: Number(e.target.value) }))} style={{ width: 80 }} />
                )}</td>
              </tr>))}
            </tbody>
          </table></div>
        </>
      )}
    </Modal>
  );
}
