import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';
import { StatusBadge, OrderTypeLabel, Modal } from '../components/shared/ui';
import { SearchableSelect } from '../components/shared/SearchableSelect';
import { SearchableDatalist } from '../components/shared/SearchableDatalist';
import { lookupReps } from '../services/lookups';
import { ReceiptPrinterService } from '../receipt/ReceiptPrinterService';
import { orderToReceipt, orderToReturnReceipt } from '../receipt/types';
import { useAuth } from '../store/auth';
import { useDir } from '../store/lang';

export function OrdersLogPage({ onNewOrder, onResume }: { onNewOrder: () => void; onResume?: (order: any) => void }) {
  const { user } = useAuth();
  const dir = useDir();
  const [tab, setTab] = useState<'log' | 'pending' | 'approvals'>('log');
  const [orderType, setOrderType] = useState('ALL');
  const [repId, setRepId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [customer, setCustomer] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const ORDER_TYPES = [
    { value: 'ALL', label: 'كل أنواع الطلب' },
    { value: 'PICKUP', label: 'استلام' },
    { value: 'RECEIVE', label: 'استقبال' },
    { value: 'DELIVERY', label: 'توصيل' },
  ];

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['orders', tab, orderType, repId, orderNumber, customer, search],
    queryFn: async () => (await api.get('/orders', {
      params: {
        tab, orderType,
        repId: repId || undefined,
        orderNumber: orderNumber.trim() || undefined,
        customer: customer.trim() || undefined,
        search: search.trim() || undefined,
      },
    })).data,
  });

  async function openDetail(o: any) {
    setSelected(o);
    setDetail(null);
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

  async function reprint(o: any) {
    // Reprint only: same number/totals, no order, no deduction.
    const ok = await ReceiptPrinterService.printReceipt(orderToReceipt(o, true));
    if (!ok) setErr(`${ReceiptPrinterService.lastError} — (إعادة المحاولة متاحة)`);
  }

  /** §1/§7 — cashier requests the return; the backend finalizes immediately
   * below the approval threshold (or for managers) and marks larger returns
   * \"pending approval\". A completed return auto-prints the RETURN RECEIPT. */
  async function requestReturn(o: any) {
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      const { data } = await api.post(`/orders/${o.id}/return-request`);
      if (data?.pendingApproval) {
        setErr(`المرتجع (${Number(o.total)}) يتجاوز حد الموافقة — أُرسل طلب الموافقة إلى المدير/المالك.`);
      } else {
        // Return executed — auto-print the RETURN RECEIPT (إيصال مرتجع).
        const ok = await ReceiptPrinterService.printReceipt(orderToReturnReceipt(data || o, false));
        if (!ok) setErr(`${ReceiptPrinterService.lastError} — اكتمل المرتجع (طباعة يدوية من سجل المرتجعات)`);
        refetch();
      }
    } catch (e: any) { setErr(apiError(e)); }
    finally { setBusy(false); }
  }

  /** §7 — manager/owner approves or rejects a pending return request. */
  async function decideReturn(id: string, approve: boolean) {
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      const { data } = await api.post(`/orders/${id}/${approve ? 'approve-return' : 'reject-return'}`);
      if (approve) {
        const ok = await ReceiptPrinterService.printReceipt(orderToReturnReceipt(data, false));
        if (!ok) setErr(`${ReceiptPrinterService.lastError} — اكتمل المرتجع`);
      }
      refetch(); setDetail(null);
    } catch (e: any) { setErr(apiError(e)); }
    finally { setBusy(false); }
  }

  async function reprintReturn(o: any) {
    const ok = await ReceiptPrinterService.printReceipt(orderToReturnReceipt(o, true));
    if (!ok) setErr(`${ReceiptPrinterService.lastError} — (إعادة المحاولة متاحة)`);
  }

  const canApprove = !!user && user.permissionLevel >= 50;
  const pendingApprovals = (tab === 'approvals' ? (data || []) : []).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} dir={dir}>
      <div className="krow orders-filterbar" style={{ padding: 6 }}>
        <button className="kbtn kbtn-primary" style={{ fontSize: 14, padding: '6px 22px' }} onClick={onNewOrder}>+ طلب جديد</button>
        <span className="klabel">رقم الطلب</span>
        <input className="kinput" placeholder="رقم الطلب" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} style={{ width: 90 }} />
        <SearchableDatalist value={orderType} options={ORDER_TYPES}
          placeholder="كل أنواع الطلب — اكتب للبحث…" onChange={(v) => setOrderType(v || 'ALL')} />
        <SearchableSelect value={repId} loadOptions={lookupReps()}
          placeholder="كل مندوبي التوصيل — اكتب للبحث…" onChange={(v) => setRepId(v)} />
        <input className="kinput" placeholder="بحث بالعميل" value={customer} onChange={(e) => setCustomer(e.target.value)} style={{ width: 150 }} />
        <input className="kinput" placeholder="بحث مفصل..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 160 }} />
        <button className="kbtn" onClick={() => refetch()}>{isFetching ? '...' : 'تحديث'}</button>
      </div>
      {err && <div className="kerr" style={{ margin: '0 6px' }}>{err}</div>}
      <div className="ktabs" style={{ padding: '0 6px' }}>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>سجل الطلبات</button>
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>الطلبات المعلقة ({(tab === 'pending' ? data || [] : []).length})</button>
        {canApprove && <button className={tab === 'approvals' ? 'active' : ''} onClick={() => setTab('approvals')}>مرتجعات بانتظار موافقة ({tab === 'approvals' ? pendingApprovals : ''})</button>}
      </div>
      <div className="ktable-wrap" style={{ flex: 1, margin: '0 6px 6px' }}>
        <table className="ktable orders-table">
          <thead><tr>
            <th>رقم الطلب</th><th>نوع الطلب</th><th>توقيت الإنشاء</th><th>أنشئ بواسطة</th><th>توقيت الإغلاق</th><th>العميل</th><th>مندوب التوصيل</th><th>وقت الخروج</th><th>لمحة</th><th>عدد الأصناف</th><th>الكمية</th><th>القيمة الإجمالية</th><th>الحالة</th>{tab === 'pending' && <th></th>}
          </tr></thead>
          <tbody>
            {(data || []).map((o: any) => (
              <tr key={o.id} className={selected?.id === o.id ? 'selected' : ''} onClick={() => openDetail(o)} onDoubleClick={() => openDetail(o)}>
                <td>{o.orderNumber}</td>
                <td><OrderTypeLabel t={o.orderType} /></td>
                <td>{new Date(o.createdAt).toLocaleString('ar-EG')}</td>
                <td>{o.createdBy?.username || '—'}</td>
                <td>{o.closedAt ? new Date(o.closedAt).toLocaleString('ar-EG') : '—'}</td>
                <td>{o.customer?.name || 'عميل نقدي'}</td>
                <td>{o.deliveryRep?.username || '—'}</td>
                <td>{o.departureTime ? new Date(o.departureTime).toLocaleString('ar-EG') : '—'}</td>
                <td>{o.items?.map((i: any) => i.productNameSnapshot).slice(0, 3).join('، ')}</td>
                <td>{o.totalItems}</td>
                <td>{Number(o.totalQuantity)}</td>
                <td><b>{Number(o.total)}</b></td>
                <td>{o.refundRequestedAt && (o.status === 'CONFIRMED' || o.status === 'COMPLETED')
                  ? <span className="kstatus" style={{ background: '#F5A623', color: '#fff', borderColor: 'transparent' }}>بانتظار موافقة</span>
                  : <StatusBadge status={o.status} />}</td>
                {tab === 'pending' && (
                  <td>{onResume
                    ? <button className="kbtn kbtn-primary" onClick={(e) => { e.stopPropagation(); onResume(o); }}>استئناف</button>
                    : <button className="kbtn" onClick={(e) => { e.stopPropagation(); openDetail(o); }} title="فتح التفاصيل">عرض</button>}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <Modal title={`طلب رقم ${detail.orderNumber}`} onClose={() => setDetail(null)} footer={
          <>
            {(detail.status === 'PENDING' || detail.status === 'HELD') && <button className="kbtn kbtn-primary" onClick={() => confirmHeld(detail.id)}>تأكيد</button>}
            {(detail.status === 'PENDING' || detail.status === 'HELD') && onResume && (
              <button className="kbtn kbtn-primary" onClick={() => { onResume(detail); setDetail(null); }}>استئناف في الكاشير</button>
            )}
            {detail.status !== 'CANCELLED' && detail.status !== 'RETURNED' && <button className="kbtn" onClick={() => cancel(detail.id)}>إلغاء</button>}
            {(detail.status === 'CONFIRMED' || detail.status === 'COMPLETED') && !detail.refundRequestedAt && (
              <button className="kbtn" disabled={busy} style={{ background: '#E5484D', color: '#fff', borderColor: 'transparent' }} onClick={() => requestReturn(detail)}>طلب مرتجع</button>
            )}
            {detail.refundRequestedAt && canApprove && (
              <>
                <button className="kbtn" disabled={busy} style={{ background: '#2E9E5B', color: '#fff', borderColor: 'transparent' }} onClick={() => decideReturn(detail.id, true)}>موافقة على المرتجع</button>
                <button className="kbtn" disabled={busy} onClick={() => decideReturn(detail.id, false)}>رفض المرتجع</button>
              </>
            )}
            {detail.status === 'RETURNED' && <button className="kbtn" onClick={() => reprintReturn(detail)}>طباعة إيصال مرتجع</button>}
            <button className="kbtn" onClick={() => reprint(detail)}>طباعة نسخة</button>
          </>
        }>
          <div className="krow">
            <span>العميل: {detail.customer?.name || 'عميل نقدي'}</span>
            <span>الإجمالي: <b>{Number(detail.total)}</b></span>
            {detail.refundRequestedAt && (detail.status === 'CONFIRMED' || detail.status === 'COMPLETED')
              ? <span className="kstatus" style={{ background: '#F5A623', color: '#fff' }}>مرتجع بانتظار الموافقة — طلب في {new Date(detail.refundRequestedAt).toLocaleString('ar-EG')}</span>
              : <StatusBadge status={detail.status} />}
          </div>
          <div className="ktable-wrap"><table className="ktable">
            <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة (تاريخي)</th><th>الإجمالي</th></tr></thead>
            <tbody>{detail.items?.map((i: any) => <tr key={i.id}><td>{i.productNameSnapshot}</td><td>{Number(i.quantity)}</td><td>{Number(i.unitPriceSnapshot)}</td><td>{Number(i.lineTotal)}</td></tr>)}</tbody>
          </table></div>
        </Modal>
      )}
    </div>
  );
}
