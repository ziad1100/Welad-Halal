import { useEffect, useState } from 'react';
import { apiError } from '../services/api';
import { useSettings } from '../store/settings';
import { SearchableDatalist } from '../components/shared/SearchableDatalist';
import { useDir } from '../store/lang';

/** Administration page: system settings used by receipts, shifts/alerts,
 * customer display, and the store-closure toggle (§1/§3/§6). */
export function SettingsPage() {
  const { values, loadAll, setValue, acceptingOrders, loadPublic } = useSettings();
  const dir = useDir();
  const [msg, setMsg] = useState<{ t: 'err' | 'ok'; m: string } | null>(null);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function save(key: keyof NonNullable<typeof values>, raw: string) {
    setMsg(null);
    try {
      await setValue(key, String(raw));
      setMsg({ t: 'ok', m: 'تم حفظ الإعداد' });
    } catch (e: any) { setMsg({ t: 'err', m: apiError(e) }); }
  }

  async function toggleStore() {
    setMsg(null);
    try {
      await setValue('store_accepting_orders', acceptingOrders ? 'false' : 'true');
      await loadPublic();
      setMsg({ t: 'ok', m: acceptingOrders ? 'أُغلق استقبال الطلبات الخارجية مؤقتًا' : 'فُتح استقبال الطلبات الخارجية' });
    } catch (e: any) { setMsg({ t: 'err', m: apiError(e) }); }
  }

  return (
    <div style={{ padding: 8, maxWidth: 720 }} dir={dir}>
      <h4>إعدادات النظام</h4>
      {msg && <div className={msg.t === 'err' ? 'kerr' : 'kok'}>{msg.m}</div>}
      {!values && <div className="kpanel">جاري تحميل الإعدادات…</div>}
      {values && (
        <>
          {/* §6 — store closure toggle (external ordering only). */}
          <div className="kpanel" style={{ marginBottom: 8, borderColor: acceptingOrders ? 'var(--k-border)' : '#E5484D' }}>
            <div className="krow">
              <span className="klabel" style={{ minWidth: 200 }}>حالة قبول الطلبات الخارجية</span>
              <button className="kbtn" style={acceptingOrders ? {} : { background: '#E5484D', color: '#fff', borderColor: '#E5484D' }} onClick={toggleStore}>
                {acceptingOrders ? '🟢 مفتوح — اضغط للإغلاق المؤقت' : '🔴 مغلق مؤقتًا — اضغط للفتح'}
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>يؤثر على الطلبات الخارجية فقط — الكاشير داخل المحل لا يتأثر.</span>
            </div>
          </div>

          <SettingRow label="رقم هاتف المحل (يُطبع على الفاتورة تحت QR)" value={values.store_phone ?? ''} onSave={(v) => save('store_phone', v)} placeholder="مثال: 01012345678" />
          <SettingRow label="حد فرق درج النقدية (ج.م)" value={values.cash_discrepancy_threshold ?? '20'} onSave={(v) => save('cash_discrepancy_threshold', v)} numeric />
          <SettingRow label="حد موافقة المرتجعات (ج.م) — أعلى منه يتطلب موافقة" value={values.return_approval_threshold ?? '500'} onSave={(v) => save('return_approval_threshold', v)} numeric />
          <SettingRow label="شاشة العرض للعميل (Customer Display)" value={values.customer_display_enabled ?? 'true'} onSave={(v) => save('customer_display_enabled', v)} bool />

          <div className="kpanel" style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              فاتورة الطباعة ثابتة: «ولاد حلال» بالعربية دائمًا + QR لصفحة الطلب العامة + سطر «للتواصل» بهذا الرقم. تغيير لغة الواجهة لا يغيّر الفاتورة.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SettingRow({ label, value, onSave, placeholder, numeric, bool }: { label: string; value: string; onSave: (v: string) => void; placeholder?: string; numeric?: boolean; bool?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (bool) {
    return (
      <div className="krow">
        <span className="klabel" style={{ minWidth: 200 }}>{label}</span>
        <SearchableDatalist value={v}
          options={[{ value: 'true', label: 'مفعّلة' }, { value: 'false', label: 'معطّلة' }]}
          placeholder="اكتب أو اختر…" onChange={(nv) => setV(nv || 'false')} />
        <button className="kbtn kbtn-primary" onClick={() => onSave(v)}>حفظ</button>
      </div>
    );
  }
  return (
    <div className="krow">
      <span className="klabel" style={{ minWidth: 200 }}>{label}</span>
      <input className="kinput" type={numeric ? 'number' : 'text'} placeholder={placeholder} value={v}
        onChange={(e) => setV(e.target.value)} style={{ width: 220 }} />
      <button className="kbtn kbtn-primary" onClick={() => onSave(v)}>حفظ</button>
    </div>
  );
}
