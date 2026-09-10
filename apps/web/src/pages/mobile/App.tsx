import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../../services/api';
import { useAuth, ROLE_AR } from '../../store/auth';
import { useAlerts } from '../../store/alerts';
import { useDir } from '../../store/lang';

/**
 * §7 — Lightweight manager mobile app (installable PWA at #/m). Reuses the
 * desktop username/password session + NestJS endpoints — no separate login.
 * Mobile-first cards: live today sales, low-stock, trend, approvals, alerts.
 */
type Tab = 'home' | 'approvals' | 'alerts';

const KIND_AR: Record<string, string> = { CASH_DISCREPANCY: 'فرق نقدية', PENDING_RETURN_APPROVAL: 'مرتجع', LOW_STOCK: 'مخزون', DAILY_SUMMARY: 'تقرير' };

export function MobileApp() {
  const { user } = useAuth();
  const dir = useDir();
  const [tab, setTab] = useState<Tab>('home');
  const [msg, setMsg] = useState('');
  const { token } = useAuth();

  const { data: daily, refetch: refetchDaily } = useQuery({ queryKey: ['m-daily'], queryFn: async () => (await api.get('/reports/daily')).data });
  const { data: low } = useQuery({ queryKey: ['m-low'], queryFn: async () => (await api.get('/inventory', { params: { low: 'true' } })).data });
  const { data: trend } = useQuery({ queryKey: ['m-trend'], queryFn: async () => (await api.get('/reports/trend', { params: { days: 7 } })).data });
  const { data: approvals, refetch: refetchApprovals } = useQuery({
    queryKey: ['m-approvals'], enabled: tab === 'approvals',
    queryFn: async () => (await api.get('/orders', { params: { tab: 'approvals', take: 30 } })).data,
  });
  const alerts = useAlerts((s) => s.items);

  useEffect(() => {
    if (user) useAlerts.getState().init(user.permissionLevel, token || '');
    const live = setInterval(() => { void refetchDaily(); }, 20000);
    return () => clearInterval(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function decide(orderId: string, approve: boolean) {
    setMsg('');
    try {
      await api.post(`/orders/${orderId}/${approve ? 'approve-return' : 'reject-return'}`);
      setMsg(approve ? 'تمت الموافقة على المرتجع' : 'تم رفض المرتجع');
      refetchApprovals(); refetchDaily();
    } catch (e: any) { setMsg(apiError(e)); }
  }

  const maxTrend = Math.max(1, ...(trend || []).map((p: any) => Number(p.sales)));

  return (
    <div dir={dir} style={{ maxWidth: 640, margin: '0 auto', padding: 10, display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>📱 <span style={{ color: 'var(--k-logo-orange)' }}>ولاد حلال</span> <small>للمدير</small></div>
        <span className="role-badge">{user ? ROLE_AR[user.role] : ''}</span>
      </div>
      {msg && <div className="kok" style={{ marginTop: 6 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
        {(['home', 'approvals', 'alerts'] as Tab[]).map((t) => (
          <button key={t} className="kbtn" style={{ flex: 1, fontWeight: tab === t ? 800 : 400, background: tab === t ? 'var(--k-selected)' : undefined, color: tab === t ? '#fff' : undefined }}
            onClick={() => setTab(t)}>
            {t === 'home' ? '🏠 الرئيسية' : t === 'approvals' ? `✅ الموافقات${(approvals || []).length ? ` (${(approvals || []).length})` : ''}` : `🔔 التنبيهات${alerts.filter((a) => !a.isRead).length ? ` (${alerts.filter((a) => !a.isRead).length})` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'home' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="kpanel" style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>مبيعات اليوم</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--k-total-green)' }}>{Number(daily?.sales ?? 0).toFixed(2)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>ج.م</div>
            </div>
            <div className="kpanel" style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>طلبات اليوم</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{daily?.orders ?? 0}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>الصافي: {Number(daily?.net ?? 0).toFixed(2)}</div>
            </div>
          </div>

          <div className="kpanel" style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>مبيعات آخر ٧ أيام</div>
            {!trend?.length && <div style={{ color: 'var(--muted)' }}>لا توجد بيانات بعد.</div>}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
              {(trend || []).map((p: any) => (
                <div key={p.date} style={{ flex: 1, textAlign: 'center' }} title={`${p.date}: ${Number(p.sales).toFixed(2)}`}>
                  <div style={{ height: Math.max(4, (Number(p.sales) / maxTrend) * 70), background: 'var(--k-selected)', borderRadius: '4px 4px 0 0' }} />
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{p.date.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="kpanel" style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ مخزون منخفض ({(low || []).length})</div>
            {(low || []).length === 0 && <div style={{ color: 'var(--muted)' }}>كل الأصناف فوق حد الطلب.</div>}
            {(low || []).slice(0, 12).map((r: any) => (
              <div key={r.productId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--k-border)' }}>
                <span>{r.product?.nameAr || r.product?.name}</span>
                <span style={{ color: '#E5484D', fontWeight: 700 }}>{Number(r.quantity)} / حد {Number(r.minimumQuantity)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'approvals' && (
        <div className="kpanel">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>مرتجعات بانتظار الموافقة</div>
          {(approvals || []).length === 0 && <div style={{ color: 'var(--muted)' }}>لا توجد مرتجعات معلقة.</div>}
          {(approvals || []).map((o: any) => (
            <div key={o.id} style={{ border: '1px solid var(--k-border)', borderRadius: 10, padding: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>طلب #{o.orderNumber}</b>
                <span style={{ fontWeight: 800, color: 'var(--k-logo-orange)' }}>{Number(o.total).toFixed(2)} ج.م</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                الكاشير: {o.createdBy?.username || '—'} — {new Date(o.refundRequestedAt || o.createdAt).toLocaleString('ar-EG')}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="kbtn" style={{ flex: 1, background: '#2E9E5B', color: '#fff', borderColor: 'transparent' }} onClick={() => decide(o.id, true)}>✓ موافقة</button>
                <button className="kbtn" style={{ flex: 1, background: '#E5484D', color: '#fff', borderColor: 'transparent' }} onClick={() => decide(o.id, false)}>✕ رفض</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="kpanel">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>تنبيهات المحل</div>
          {alerts.length === 0 && <div style={{ color: 'var(--muted)' }}>لا توجد تنبيهات.</div>}
          {alerts.map((a) => (
            <div key={a.id} style={{ border: '1px solid var(--k-border)', borderRadius: 10, padding: 8, marginBottom: 8, opacity: a.isRead ? 0.7 : 1 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="kstatus">{KIND_AR[a.kind] || a.kind}</span>
                <b style={{ fontSize: 13 }}>{a.title}</b>
              </div>
              <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: '4px 0' }}>{a.message}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(a.createdAt).toLocaleString('ar-EG')}</div>
            </div>
          ))}
          {(alerts.length > 0) && (
            <button className="kbtn" onClick={() => void useAlerts.getState().markAll()}>تحديد الكل كمقروء</button>
          )}
        </div>
      )}

      <PushToggle />
    </div>
  );
}

/** §7 — Web Push opt-in (PWA notifications) using the backend VAPID config. */
function PushToggle() {
  const [vapid, setVapid] = useState('');
  const [state, setState] = useState<'unknown' | 'on' | 'off' | 'unsupported'>('unknown');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.get('/push/config').then(({ data }) => {
      const pk = String(data?.vapidPublicKey || '');
      setVapid(pk);
      if (!pk) { setState('off'); return; }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setState('unsupported'); return; }
      void navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return setState('off');
        void reg.pushManager.getSubscription().then((s) => setState(s ? 'on' : 'off'));
      });
    }).catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    if (!vapid) { setMsg('الإشعارات الفورية غير مفعلة على الخادم (VAPID)'); return; }
    try {
      const reg = await navigator.serviceWorker.register(`${(import.meta as any).env?.BASE_URL || '/'}sw.js`);
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid).buffer as ArrayBuffer });
      await api.post('/push/subscribe', { endpoint: sub.endpoint, keys: { p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))), auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))) } });
      setState('on'); setMsg('تم تفعيل الإشعارات — التنبيهات ستصل فورياً');
    } catch (e: any) { setMsg(apiError(e) || 'تعذر تفعيل الإشعارات — جرّب على https'); }
  }

  if (state === 'unsupported') return <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>الإشعارات الفورية متاحة عبر PWA على اتصال آمن (https).</div>;
  if (state === 'off') return (
    <div style={{ textAlign: 'center', marginTop: 8 }}>
      {msg && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{msg}</div>}
      <button className="kbtn" onClick={enable}>🔔 تفعيل إشعارات التنبيهات</button>
    </div>
  );
  if (state === 'on') return <div style={{ fontSize: 11, color: '#2E9E5B', textAlign: 'center', marginTop: 8 }}>🔔 الإشعارات مفعّلة.</div>;
  return <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>الإشعارات غير مهيأة.</div>;
}

/** Convert a base64url VAPID key into a Uint8Array for pushManager. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
