import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { SearchableSelect } from '../components/shared/SearchableSelect';
import { SearchableDatalist } from '../components/shared/SearchableDatalist';
import { lookupEmployees } from '../services/lookups';
import { useSettings } from '../store/settings';
import { useDir } from '../store/lang';

/** §4 — Shift History screen (Manager/Owner): all past shifts per employee
 * with the discrepancy flagged in red when it exceeds the configured threshold. */
export function ShiftsPage() {
  const [employeeId, setEmployeeId] = useState('');
  const dir = useDir();
  const [status, setStatus] = useState('');
  const { values, loadAll } = useSettings();
  useEffect(() => { void loadAll(); }, [loadAll]);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['shifts-history', employeeId, status],
    queryFn: async () => (await api.get('/shifts', { params: { employeeId: employeeId || undefined, status: status || undefined } })).data,
  });

  const threshold = Number(values?.cash_discrepancy_threshold ?? 20);

  const openCount = (data || []).filter((s: any) => s.status === 'open').length;

  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', height: '100%' }} dir={dir}>
      <div className="krow">
        <h4 style={{ margin: 0 }}>الشيفتات — تسوية درج النقدية</h4>
        <span className="kstatus">{openCount > 0 ? `🟢 ${openCount} شيفت مفتوح` : 'لا شيفتات مفتوحة'}</span>
        <span style={{ flex: 1 }} />
        <SearchableSelect value={employeeId} loadOptions={lookupEmployees()}
          placeholder="كل الموظفين — اكتب للبحث…" onChange={(v) => setEmployeeId(v)} />
        <SearchableDatalist value={status}
          options={[{ value: '', label: 'كل الحالات' }, { value: 'open', label: 'مفتوح' }, { value: 'closed', label: 'مغلق' }]}
          placeholder="اكتب أو اختر الحالة…" onChange={(v) => setStatus(v)} />
        <button className="kbtn" onClick={() => refetch()}>{isFetching ? '...' : 'تحديث'}</button>
      </div>
      <div className="kpanel" style={{ marginBottom: 6, fontSize: 12 }}>
        المتوقع = نقدية الافتتاح + مبيعات مؤكدة نقدية − مرتجعات نقدية. الفرق = المعدود − المتوقع.
        يُعلَّم بالأحمر إذا تجاوز حد {threshold} ج.م (قابل للتعديل من صفحة الإعدادات).
      </div>
      <div className="ktable-wrap" style={{ flex: 1 }}>
        <table className="ktable">
          <thead><tr>
            <th>الكاشير</th><th>البداية</th><th>النهاية</th><th>افتتاح</th><th>المتوقع</th>
            <th>المعدود</th><th>الفرق</th><th>الحالة</th><th>أغلق بواسطة</th>
          </tr></thead>
          <tbody>
            {(data || []).map((s: any) => {
              const disc = s.discrepancyAmount === null ? null : Number(s.discrepancyAmount);
              const flag = disc !== null && Math.abs(disc) > threshold;
              return (
                <tr key={s.id}>
                  <td>{s.employee?.user?.fullName || s.employee?.user?.username || '—'}</td>
                  <td>{new Date(s.startedAt).toLocaleString('ar-EG')}</td>
                  <td>{s.endedAt ? new Date(s.endedAt).toLocaleString('ar-EG') : '—'}</td>
                  <td>{Number(s.openingCashAmount).toFixed(2)}</td>
                  <td>{s.expectedCashAmount === null ? '—' : Number(s.expectedCashAmount).toFixed(2)}</td>
                  <td>{s.closingCashAmount === null ? '—' : Number(s.closingCashAmount).toFixed(2)}</td>
                  <td style={{ color: flag ? '#E5484D' : undefined, fontWeight: flag ? 700 : undefined }}>
                    {disc === null ? '—' : (disc > 0 ? `+${disc.toFixed(2)}` : disc.toFixed(2))}
                    {flag && ' ⚠'}
                  </td>
                  <td>{s.status === 'open' ? <span className="kstatus">مفتوح</span> : <span className="kstatus">مغلق</span>}</td>
                  <td>{s.closedBy?.fullName || s.closedBy?.username || '—'}</td>
                </tr>
              );
            })}
            {(data || []).length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)' }}>لا توجد شيفتات — تبدأ الشيفتات من شاشة الكاشير (بدء الشيفت).</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
