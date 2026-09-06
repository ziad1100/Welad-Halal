import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';
import { StatusBadge, OrderTypeLabel, Modal } from '../components/shared/ui';

export function OrdersLogPage({ onNewOrder }: { onNewOrder: () => void }) {
  const [tab, setTab] = useState<'log' | 'pending'>('log');
  const [orderType, setOrderType] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [err, setErr] = useState('');

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['orders', tab, orderType, search],
    queryFn: async () => (await api.get('/orders', { params: { tab, orderType, search } })).data,
  });

  async function openDetail(o: any) {
    setSelected(o);
    try {
      const { data } = await api.get(`/orders/${o.id}`);
      setDetail(data);
    } catch (e: any) { setErr(apiError(e)); }
  }

  async function cancel(id: string) {
    try { await api.post(`/orders/${id}/cancel`); setDetail(null); refetch(); }
    catch (e: any) { setErr(apiError(e)); }
  }
  async function confirmHeld(id: string) {
    try { await api.post(`/orders/${id}/confirm`); setDetail(null); refetch(); }
    catch (e: any) { setErr(apiError(e)); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} dir="rtl">
      <div className="krow" style={{ padding: 6 }}>
        <button className="kbtn kbtn-primary" style={{ fontSize: 14, padding: '6px 22px' }} onClick={onNewOrder}>+ طلب جديد</button>
        <select className="kselect" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
          <option value="ALL">كل الأنواع</option>
          <option value="PICKUP">استلام</option>
          <option value="RECEIVE">استقبال</option>
          <option value="DELIVERY">توصيل</option>
        </select>
        <select className="kselect"><option>كل المناديب</option></select>
        <input className="kinput" placeholder="بحث مفصل..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
        <button className="kbtn" onClick={() => refetch()}>{isFetching ? '...' : 'تحديث'}</button>
      </div>
      {err && <div className="kerr">{err}</div>}
      <div className="ktabs" style={{ padding: '0 6px' }}>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>سجل الطلبات</button>
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>الطلبات المعلقة ({(data || []).length})</button>
      </div>
      <div className="ktable-wrap" style={{ flex: 1, margin: '0 6px 6px' }}>
        <table className="ktable">
          <thead><tr>
            <th>رقم الطلب</th><th>النوع</th><th>وقت الإنشاء</th><th>أنشأه</th><th>وقت الإغلاق</th><th>المندوب</th><th>وقت الانطلاق</th><th>الأصناف</th><th>عدد الأصناف</th><th>الكمية</th><th>التكلفة</th><th>القيمة الإجمالية</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            {(data || []).map((o: any) => (
              <tr key={o.id} className={selected?.id === o.id ? 'selected' : ''} onClick={() => openDetail(o)} onDoubleClick={() => openDetail(o)}>
                <td>{o.orderNumber}</td>
                <td><OrderTypeLabel t={o.orderType} /></td>
                <td>{new Date(o.createdAt).toLocaleString('ar-EG')}</td>
                <td>{o.createdBy?.username || '—'}</td>
                <td>{o.closedAt ? new Date(o.closedAt).toLocaleString('ar-EG') : '—'}</td>
                <td>{o.deliveryRep?.username || '—'}</td>
                <td>{o.departureTime ? new Date(o.departureTime).toLocaleString('ar-EG') : '—'}</td>
                <td>{o.items?.map((i: any) => i.productNameSnapshot).slice(0, 3).join('، ')}</td>
                <td>{o.totalItems}</td>
                <td>{Number(o.totalQuantity)}</td>
                <td>{Number(o.subtotal)}</td>
                <td><b>{Number(o.total)}</b></td>
                <td><StatusBadge status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <Modal title={`طلب رقم ${detail.orderNumber}`} onClose={() => setDetail(null)} footer={
          <>
            {(detail.status === 'PENDING' || detail.status === 'HELD') && <button className="kbtn kbtn-primary" onClick={() => confirmHeld(detail.id)}>تأكيد</button>}
            {detail.status !== 'CANCELLED' && detail.status !== 'RETURNED' && <button className="kbtn" onClick={() => cancel(detail.id)}>إلغاء</button>}
            <button className="kbtn" onClick={() => window.print()}>طباعة</button>
          </>
        }>
          <div className="krow"><span>العميل: {detail.customer?.name || 'عميل نقدي'}</span><span>الإجمالي: <b>{Number(detail.total)}</b></span><StatusBadge status={detail.status} /></div>
          <div className="ktable-wrap"><table className="ktable">
            <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة (تاريخي)</th><th>الإجمالي</th></tr></thead>
            <tbody>{detail.items?.map((i: any) => <tr key={i.id}><td>{i.productNameSnapshot}</td><td>{Number(i.quantity)}</td><td>{Number(i.unitPriceSnapshot)}</td><td>{Number(i.lineTotal)}</td></tr>)}</tbody>
          </table></div>
        </Modal>
      )}
    </div>
  );
}
