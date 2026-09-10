import { useSettings } from '../../store/settings';
import { useAuth } from '../../store/auth';
import { useDir } from '../../store/lang';

/** §6 — persistent banner in the Orders Management shell while the store is
 * marked closed to EXTERNAL ordering. The in-store Cashier screen is never
 * affected; managers can re-open directly from the banner. */
export function StoreClosedBanner() {
  const { acceptingOrders, loadPublic, setAccepting } = useSettings();
  const { user } = useAuth();
  const dir = useDir();
  const canManage = !!user && user.permissionLevel >= 50;
  if (acceptingOrders) return null;
  return (
    <div style={{
      background: '#E5484D', color: '#fff', padding: '6px 12px', display: 'flex', gap: 10,
      alignItems: 'center', fontWeight: 700, fontSize: 13,
    }} dir={dir}>
      <span>🔴 المحل مغلق مؤقتًا للطلبات الخارجية — شاشة الكاشير داخل المحل تعمل بشكل طبيعي.</span>
      <span style={{ flex: 1 }} />
      {canManage && (
        <button className="kbtn" style={{ background: '#fff', color: '#C0392B', borderColor: 'transparent' }}
          onClick={() => { void setAccepting(true).then(() => loadPublic()); }}>
          إعادة فتح الطلبات الخارجية
        </button>
      )}
    </div>
  );
}
