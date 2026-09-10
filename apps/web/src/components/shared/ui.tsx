import type { ReactNode } from 'react';
import { useAuth, levelAtLeast } from '../../store/auth';
import { useDir } from '../../store/lang';

export function Modal({ title, onClose, children, footer, modalClass }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; modalClass?: string }) {
  const dir = useDir();
  return (
    <div className="kmodal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`kmodal${modalClass ? ` ${modalClass}` : ''}`} dir={dir}>
        <div className="kmodal-title"><span>{title}</span><button className="kbtn" onClick={onClose}>X</button></div>
        <div className="kmodal-body">{children}</div>
        {footer && <div className="kmodal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const ar: Record<string, string> = { PENDING: 'معلق', HELD: 'محجوز', CONFIRMED: 'مؤكد', COMPLETED: 'مكتمل', CANCELLED: 'ملغي', RETURNED: 'مرتجع' };
  return <span className="kstatus">{ar[status] || status}</span>;
}

export function OrderTypeLabel({ t }: { t: string }) {
  const ar: Record<string, string> = { PICKUP: 'استلام', RECEIVE: 'استقبال', DELIVERY: 'توصيل' };
  return <span>{ar[t] || t}</span>;
}

export function RequireLevel({ level, children }: { level: number; children: ReactNode }) {
  const { user } = useAuth();
  const dir = useDir();
  if (!levelAtLeast(user, level)) {
    return (
      <div className="denied" dir={dir}>
        <div className="kerr" style={{ display: 'inline-block' }}>هذا المستخدم غير مصرح له — هذه الصفحة تتطلب صلاحية أعلى.</div>
      </div>
    );
  }
  return <>{children}</>;
}
/** Back-compat alias (level-based; prefer RequireLevel). */
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth();
  const dir = useDir();
  if (!user || !roles.includes(user.role)) {
    return (
      <div className="denied" dir={dir}>
        <div className="kerr" style={{ display: 'inline-block' }}>هذا المستخدم غير مصرح له — هذه الصفحة تتطلب صلاحية أعلى.</div>
      </div>
    );
  }
  return <>{children}</>;
}
