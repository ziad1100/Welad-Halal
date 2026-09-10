import { useEffect, useState, type ReactNode } from 'react';
import { api, apiError } from '../../services/api';
import { Modal } from '../shared/ui';
import { useDir } from '../../store/lang';

export interface ShiftInfo {
  id: string;
  status: 'open' | 'closed';
  openingCashAmount: number;
  expectedCashAmount: number | null;
  closingCashAmount: number | null;
  discrepancyAmount: number | null;
  startedAt: string;
  endedAt: string | null;
  employee?: { user?: { username?: string; fullName?: string } };
}

export interface ShiftActions {
  /** Close the End-Shift modal & clear current shift state (POS header chip). */
  requestEnd: () => void;
  refresh: () => Promise<void>;
}

/** §4 — Start Shift modal: prompts the actual drawer cash before the POS unlocks. */
export function StartShiftModal({ onStarted, onDismiss, dismissLabel }: { onStarted: (s: ShiftInfo) => void; onDismiss?: () => void; dismissLabel?: string }) {
  const [amount, setAmount] = useState('');
  const dir = useDir();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function start() {
    const v = Number(amount);
    if (!(v >= 0)) { setErr('أدخل المبلغ النقدي الفعلي في الدرج'); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/shifts/open', { openingCashAmount: Math.round(v * 100) / 100 });
      onStarted(data);
    } catch (e: any) { setErr(apiError(e)); setBusy(false); }
  }
  return (
    <div className="kmodal-back">
      <div className="kmodal" dir={dir} style={{ minWidth: 400, maxWidth: 460 }}>
        <div className="kmodal-title"><span>بدء الشيفت — درج النقدية</span>{onDismiss && <button className="kbtn" onClick={onDismiss}>X</button>}</div>
        <div className="kmodal-body">
          <p>قبل فتح شاشة الكاشير، أدخل المبلغ النقدي الفعلي الموجود في الدرج الآن.</p>
          {err && <div className="kerr">{err}</div>}
          <div className="krow"><span className="klabel">المبلغ النقدي (ج.م)</span>
            <input className="kinput" type="number" min={0} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') start(); }} style={{ width: 160 }} /></div>
        </div>
        <div className="kmodal-foot">
          <button className="kbtn kbtn-primary" disabled={busy} onClick={start}>{busy ? '...' : 'بدء الشيفت'}</button>
          {onDismiss && <button className="kbtn" onClick={onDismiss}>{dismissLabel || 'تخطي (مدير)'}</button>}
        </div>
      </div>
    </div>
  );
}

/** §4 — End Shift modal: counted cash vs live expected cash, closes the shift. */
export function EndShiftModal({ shift, onClosed, onClose }: { shift: ShiftInfo; onClosed: (s: any) => void; onClose: () => void }) {
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState<{ expectedCash: number; sales: number; refunds: number } | null>(null);

  useEffect(() => {
    api.get(`/shifts/${shift.id}/expected`).then(({ data }) => setInfo(data)).catch(() => {});
  }, [shift.id]);

  async function end() {
    const v = Number(counted);
    if (!(v >= 0)) { setErr('أدخل المبلغ النقدي المُعدّ فعلياً'); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await api.post(`/shifts/${shift.id}/close`, { closingCashAmount: Math.round(v * 100) / 100 });
      onClosed(data);
    } catch (e: any) { setErr(apiError(e)); setBusy(false); }
  }

  const expected = info?.expectedCash ?? Number(shift.expectedCashAmount ?? 0);
  return (
    <Modal title="إنهاء الشيفت" onClose={onClose} footer={
      <>
        <button className="kbtn kbtn-primary" disabled={busy} onClick={end}>{busy ? '...' : 'إنهاء الشيفت'}</button>
        <button className="kbtn" onClick={onClose}>إلغاء</button>
      </>
    }>
      <p>عُد النقدية الفعلية في الدرج وأدخل المبلغ قبل الإنهاء.</p>
      {err && <div className="kerr">{err}</div>}
      <div className="kpanel" style={{ marginBottom: 8 }}>
        <div className="krow"><span>افتتاح الشيفت:</span><b>{Number(shift.openingCashAmount).toFixed(2)} ج.م</b></div>
        {info && <><div className="krow"><span>مبيعات الشيفت:</span><b>{info.sales.toFixed(2)}</b></div>
          <div className="krow"><span>مرتجعات الشيفت:</span><b>{info.refunds.toFixed(2)}</b></div></>}
        <div className="krow"><span>المتوقع (تلقائي):</span><b style={{ color: 'var(--k-confirm)' }}>{expected.toFixed(2)} ج.م</b></div>
      </div>
      <div className="krow"><span className="klabel">النقدية المعدودة فعلياً</span>
        <input className="kinput" type="number" min={0} autoFocus value={counted} onChange={(e) => setCounted(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') end(); }} style={{ width: 160 }} /></div>
      <div className="kpanel" style={{ fontSize: 12, marginTop: 8 }}>الفرق = المعدود − المتوقع. إن تجاوز الحد المسموح يصل تنبيه فوري للمدير/المالك.</div>
    </Modal>
  );
}

export interface ShiftGateProps {
  userId: string;
  allowSkip?: boolean;
  /** Render the actual POS when a shift is open (or after a manager skips). */
  render: (shift: ShiftInfo | null, actions: ShiftActions) => ReactNode;
}

/**
 * §4 — gate: the Cashier screen is usable only while a shift is open. Managers
 * (level ≥50) may skip and open the drawer later from the POS header chip.
 */
export function ShiftGate({ userId, allowSkip, render }: ShiftGateProps) {
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  async function refresh() {
    try {
      const { data } = await api.get('/shifts/me/current');
      setShift(data?.shift || null);
    } catch { setShift(null); }
  }
  useEffect(() => { void refresh().finally(() => setLoading(false)); }, [userId]);

  if (loading) return <div className="kpanel" style={{ padding: 16 }}>جاري التحقق من الشيفت…</div>;

  if (!shift && !(allowSkip && skipped)) {
    return <StartShiftModal
      onStarted={(s) => { setShift(s); setEndOpen(false); }}
      onDismiss={allowSkip ? () => setSkipped(true) : undefined}
    />;
  }

  return (
    <>
      {endOpen && shift && (
        <EndShiftModal shift={shift} onClose={() => setEndOpen(false)} onClosed={() => { setShift(null); setEndOpen(false); setSkipped(false); void refresh(); }} />
      )}
      {render(shift, { requestEnd: () => setEndOpen(true), refresh: async () => { await refresh(); } })}
    </>
  );
}
