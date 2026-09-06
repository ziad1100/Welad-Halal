import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';

export function StockTakePage() {
  const [name, setName] = useState('');
  const [takeId, setTakeId] = useState('');
  const [scan, setScan] = useState('');
  const [msg, setMsg] = useState<{ t: 'err' | 'ok'; m: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { data: takes, refetch: refetchTakes } = useQuery({ queryKey: ['stocktakes'], queryFn: async () => (await api.get('/inventory/stocktakes')).data });
  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ['stocktake', takeId], enabled: !!takeId,
    queryFn: async () => (await api.get(`/inventory/stocktakes/${takeId}`)).data,
  });

  async function open() {
    try {
      const { data } = await api.post('/inventory/stocktakes', { name: name || `جرد ${new Date().toLocaleDateString('ar-EG')}` });
      setName(''); setTakeId(data.id); refetchTakes();
      setMsg({ t: 'ok', m: 'تم فتح جلسة الجرد — سجل العد لكل صنف' });
    } catch (e: any) { setMsg({ t: 'err', m: apiError(e) }); }
  }

  async function saveCounts(counts: { productId: string; countedQty: number }[]) {
    try {
      await api.patch(`/inventory/stocktakes/${takeId}/lines`, { lines: counts });
      refetchDetail();
    } catch (e: any) { setMsg({ t: 'err', m: apiError(e) }); }
  }

  // scan-to-count: barcode → fills that row's count input and advances
  async function scanCount() {
    const code = scan.trim();
    if (!code || !detail) return;
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      if (!data) { setMsg({ t: 'err', m: 'المنتج غير موجود' }); return; }
      const line = detail.lines.find((l: any) => l.productId === data.id);
      if (!line) { setMsg({ t: 'err', m: 'الصنف خارج نطاق الجرد' }); return; }
      setScan('');
      document.getElementById(`count-${data.id}`)?.focus();
    } catch { setMsg({ t: 'err', m: 'المنتج غير موجود' }); }
  }

  async function commit() {
    try {
      const { data } = await api.post(`/inventory/stocktakes/${takeId}/commit`);
      setMsg({ t: 'ok', m: `تم اعتماد الجرد — طُبق ${data.applied} من ${data.counted}` });
      setConfirming(false); refetchDetail(); refetchTakes();
    } catch (e: any) { setMsg({ t: 'err', m: apiError(e) }); }
  }

  const lines: any[] = detail?.lines || [];
  const isOpen = detail?.status === 'OPEN';

  return (
    <div style={{ padding: 8, display: 'flex', gap: 8, height: '100%' }} dir="rtl">
      <div style={{ width: 280 }}>
        <h4>جلسات الجرد الدوري</h4>
        <div className="krow">
          <input className="kinput" placeholder="اسم الجلسة" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="kbtn kbtn-primary" onClick={open}>+ فتح جرد جديد</button>
        <div className="ktable-wrap" style={{ marginTop: 8 }}><table className="ktable">
          <thead><tr><th>الجلسة</th><th>الحالة</th><th>التاريخ</th></tr></thead>
          <tbody>{(takes || []).map((t: any) => (
            <tr key={t.id} className={takeId === t.id ? 'selected' : ''} onClick={() => setTakeId(t.id)}>
              <td>{t.name}</td><td>{t.status === 'OPEN' ? 'مفتوح' : t.status === 'COMMITTED' ? 'معتمد' : 'ملغي'}</td>
              <td>{new Date(t.createdAt).toLocaleDateString('ar-EG')}</td>
            </tr>))}</tbody>
        </table></div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {msg && <div className={msg.t === 'err' ? 'kerr' : 'kok'}>{msg.m}</div>}
        {!detail && <div className="kpanel">اختر جلسة أو افتح جرداً جديداً.</div>}
        {detail && (
          <>
            <div className="krow">
              <b>{detail.name}</b>
              <span>الإجمالي: {detail.summary.total} — معدود: {detail.summary.counted} — عجز: {detail.summary.shortages} — زيادة: {detail.summary.overages}</span>
              <input className="kinput" placeholder="مسح باركود للعد…" value={scan} onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') scanCount(); }} style={{ width: 200 }} disabled={!isOpen} />
              {isOpen && !confirming && <button className="kbtn kbtn-primary" onClick={() => setConfirming(true)}>مراجعة واعتماد</button>}
              {confirming && <><button className="kbtn kbtn-primary" onClick={commit}>تأكيد الاعتماد</button><button className="kbtn" onClick={() => setConfirming(false)}>رجوع</button></>}
            </div>
            <div className="ktable-wrap" style={{ flex: 1 }}><table className="ktable">
              <thead><tr><th>الصنف</th><th>النظام (لقطة)</th><th>الحالي (حي)</th><th>المعدود</th><th>الفرق</th><th>انحراف أثناء الجرد</th></tr></thead>
              <tbody>{lines.map((l: any) => {
                const diff = l.diff === null ? null : Number(l.diff);
                return (
                  <tr key={l.productId}>
                    <td>{l.product?.nameAr || l.product?.name}</td>
                    <td>{Number(l.systemQty)}</td>
                    <td>{Number(l.liveQty)}{Number(l.drift) !== 0 && <span className="kstatus" title="بيع أثناء الجرد">Δ {Number(l.drift)}</span>}</td>
                    <td>{isOpen
                      ? <CountInput key={l.productId + String(l.countedQty)} id={`count-${l.productId}`} initial={l.countedQty === null ? '' : String(Number(l.countedQty))}
                        onCommit={(v) => saveCounts([{ productId: l.productId, countedQty: v }])} />
                      : (l.countedQty === null ? '—' : Number(l.countedQty))}</td>
                    <td style={{ color: diff === null ? undefined : diff < 0 ? '#C00' : diff > 0 ? '#B7791F' : undefined }}>
                      <b>{diff === null ? '—' : diff > 0 ? `+${diff}` : diff}</b></td>
                    <td>{Number(l.drift) !== 0 ? '⚠ تغير أثناء العد' : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </>
        )}
      </div>
    </div>
  );
}

function CountInput({ id, initial, onCommit }: { id: string; initial: string; onCommit: (v: number) => void }) {
  const [v, setV] = useState(initial);
  return (
    <input id={id} className="kinput" type="number" min={0} value={v} style={{ width: 90 }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== '' && v !== initial) onCommit(Number(v)); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }} />
  );
}

export function ExpiryWidget({ days: initDays = 7 }: { days?: number }) {
  const [days, setDays] = useState(initDays);
  const { data } = useQuery({ queryKey: ['expiring', days], queryFn: async () => (await api.get('/inventory/expiring', { params: { days } })).data });
  return (
    <div className="kpanel" dir="rtl">
      <div className="krow">
        <b>⏳ وشيكة الانتهاء</b>
        <select className="kselect" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>7 أيام</option><option value={14}>14 يوم</option><option value={30}>30 يوم</option>
        </select>
        <span className="kstatus">{(data || []).length} تشغيلة</span>
      </div>
      {(data || []).length === 0 && <div style={{ color: 'var(--muted)' }}>لا توجد تشغيلات وشيكة الانتهاء.</div>}
      {(data || []).slice(0, 8).map((b: any) => (
        <div key={b.id} style={{ color: b.daysLeft <= 3 ? '#C00' : undefined }}>
          • {b.product?.nameAr || b.product?.name} — {b.quantity} — ينتهي {new Date(b.expiryDate).toLocaleDateString('ar-EG')} (متبق {b.daysLeft} يوم)
        </div>
      ))}
    </div>
  );
}
