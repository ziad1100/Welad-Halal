import { useEffect, useState } from 'react';
import { useAlerts } from '../../store/alerts';
import { alertChime } from '../../store/settings';

const KIND_AR: Record<string, string> = {
  CASH_DISCREPANCY: 'نقدية',
  PENDING_RETURN_APPROVAL: 'مرتجع',
  LOW_STOCK: 'مخزون',
  DAILY_SUMMARY: 'تقرير',
};

function sevColor(s: string) {
  if (s === 'CRITICAL') return '#E5484D';
  if (s === 'WARNING') return '#F5A623';
  return '#2E9E5B';
}

/** §3 — bell + dropdown inbox for manager/owner. Plays an audible chime on a
 * newly arriving alert (Orders Management app open anywhere). */
export function AlertsBell() {
  const { unread, items, markRead, markAll, last, clearLast } = useAlerts();
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Audible + visual alert when a real-time alert arrives.
  useEffect(() => {
    if (!last) return;
    alertChime(true);
    setBanner(last.title);
    const id = setTimeout(() => { setBanner(null); clearLast(); }, 8000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id]);

  return (
    <>
      {banner && (
        <div style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: '#E5484D', color: '#fff', padding: '6px 14px', borderRadius: 20, fontWeight: 700, boxShadow: '0 6px 24px rgba(0,0,0,.35)' }}>
          {banner} — اُنقر جرس التنبيهات للتفاصيل
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <button className="kbtn" onClick={() => { void useAlerts.getState().refresh(); setOpen(!open); }} title="التنبيهات">
          🔔 {unread > 0 ? <b style={{ color: '#E5484D' }}>({unread})</b> : ''}
        </button>
        {open && (
          <div className="alerts-pop">
            <div className="krow" style={{ justifyContent: 'space-between' }}>
              <b>🔔 التنبيهات</b>
              <button className="kbtn" style={{ fontSize: 11 }} onClick={() => void markAll()}>قراءة الكل</button>
            </div>
            {items.length === 0 && <div style={{ padding: 12, color: 'var(--muted)', textAlign: 'center' }}>لا توجد تنبيهات</div>}
            {items.map((a) => (
              <div key={a.id} onClick={() => { if (!a.isRead) void markRead(a.id); }} style={{ cursor: 'pointer', border: '1px solid var(--k-border)', borderRadius: 8, padding: 6, marginBottom: 6, background: a.isRead ? 'var(--surface-2)' : 'var(--surface)', opacity: a.isRead ? 0.7 : 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ background: sevColor(a.severity), color: '#fff', borderRadius: 20, padding: '0 8px', fontSize: 10 }}>{a.severity}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{KIND_AR[a.kind] || a.kind}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(a.createdAt).toLocaleString('ar-EG')}</span>
                </div>
                <div style={{ fontWeight: 600, margin: '2px 0' }}>{a.title}</div>
                <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{a.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
