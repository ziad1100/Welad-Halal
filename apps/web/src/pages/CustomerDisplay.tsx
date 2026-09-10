import { useEffect, useState } from 'react';
import { useCustomerDisplay, displayStale, type DisplaySnapshot } from '../store/display';
import { useSettings } from '../store/settings';

/** §2 — Customer-facing display (second screen / BrowserWindow). Read-only,
 * no cashier controls: item, unit price, quantity, running total in large text.
 * Rendered on its own route (#/display) — can run without login. */
export function CustomerDisplayPage() {
  const [snap, setSnap] = useState<DisplaySnapshot | null>(null);
  const [, setTick] = useState(0);
  const { loadPublic } = useSettings();
  useEffect(() => { void loadPublic(); }, [loadPublic]);

  useEffect(() => {
    // Subscribe on mount; a new window re-reads the last stored snapshot too.
    const unsub = useCustomerDisplay.getState().subscribe((s) => setSnap(s));
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => { unsub(); clearInterval(id); };
  }, []);

  const stale = displayStale(snap);
  const hasItems = !!snap && snap.lines.length > 0 && !stale;

  return (
    <div style={{
      height: '100%', background: '#04101f', color: '#fff', display: 'flex',
      flexDirection: 'column', padding: '3vmin', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #F5A623', paddingBottom: '1.2vmin' }}>
        <div style={{ fontSize: '7vmin', fontWeight: 900 }}>
          <span style={{ color: '#F5A623' }}>ولاد حلال</span>
        </div>
        <div style={{ fontSize: '3.4vmin', color: '#9fb3c8' }}>
          {snap?.customerName || 'عميل نقدي'}
        </div>
      </div>

      {!hasItems ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '2vmin' }}>
          <div style={{ fontSize: '12vmin' }}>🛒</div>
          <div style={{ fontSize: '5vmin', color: '#d7e3f0' }}>
            {snap && !snap.lines.length ? 'بانتظار إضافة الأصناف…' : 'جاري التجهيز…'}
          </div>
        </div>
      ) : (
        <>
          {/* items */}
          <div style={{ flex: 1, overflow: 'hidden', marginTop: '1.5vmin' }}>
            {snap!.lines.slice(0, 12).map((l, i) => (
              <div key={`${l.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '2vmin', padding: '1.2vmin 0', borderBottom: '1px solid rgba(255,255,255,.08)', fontSize: '4.4vmin' }}>
                <span style={{ width: '8vmin', color: '#F5A623', fontWeight: 700 }}>{l.quantity}x</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{l.name}</span>
                <span style={{ width: '20vmin', textAlign: 'center', color: '#c9d6e4' }}>{l.unitPrice.toFixed(2)}</span>
              </div>
            ))}
          </div>
          {/* running total */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderTop: '3px solid #F5A623', paddingTop: '2vmin', marginTop: '1vmin' }}>
            <span style={{ fontSize: '4.6vmin', color: '#d7e3f0' }}>الإجمالي الحالي</span>
            <span style={{ fontSize: '9vmin', fontWeight: 900, color: '#7CE7A3' }}>{snap!.total.toFixed(2)} <small style={{ fontSize: '3vmin' }}>ج.م</small></span>
          </div>
        </>
      )}
    </div>
  );
}
