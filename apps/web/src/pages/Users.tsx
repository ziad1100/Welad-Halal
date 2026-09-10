import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';
import { useAuth, ROLE_AR, type RoleName } from '../store/auth';
import { useDir } from '../store/lang';
import { normalizeUsername } from '../utils/username';

const PERMISSION_CATEGORIES = [
  { labelAr: 'المستخدمون', permissions: ['users.view', 'users.create', 'users.edit', 'users.disable', 'users.reset_password', 'users.change_role'] },
  { labelAr: 'الأصناف', permissions: ['products.view', 'products.create', 'products.edit', 'products.delete', 'products.change_price'] },
  { labelAr: 'المخزون', permissions: ['inventory.view', 'inventory.adjust', 'inventory.stocktake'] },
  { labelAr: 'المشتريات', permissions: ['purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive'] },
  { labelAr: 'المبيعات', permissions: ['sales.view', 'sales.create', 'sales.refund', 'sales.cancel'] },
  { labelAr: 'الموردون', permissions: ['suppliers.view', 'suppliers.create', 'suppliers.edit'] },
  { labelAr: 'العملاء', permissions: ['customers.view', 'customers.create', 'customers.edit'] },
  { labelAr: 'التقارير', permissions: ['reports.view', 'reports.financial'] },
  { labelAr: 'الإعدادات', permissions: ['settings.view', 'settings.edit'] },
  { labelAr: 'سجل العمليات', permissions: ['audit.view'] },
];

interface Row {
  id: string; fullName: string; username: string; role: RoleName;
  permissionLevel: number; isOwner: boolean; isActive: boolean; forcePasswordChange: boolean;
  phone?: string; email?: string; lastLoginAt?: string; createdAt: string; permissions: string[];
}

export function UserManagementPage() {
  const { user: me } = useAuth();
  const dir = useDir();
  const [form, setForm] = useState({ fullName: '', username: '', password: '', confirmPassword: '', role: 'employee' as RoleName, generate: false, phone: '', email: '' });
  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', email: '' });
  const [resetting, setResetting] = useState<Row | null>(null);
  const [resetForm, setResetForm] = useState({ password: '', generate: false });
  const [changingRole, setChangingRole] = useState<Row | null>(null);
  const [newRole, setNewRole] = useState<RoleName>('employee');
  const [managingPerms, setManagingPerms] = useState<Row | null>(null);
  const [permDraft, setPermDraft] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ t: string; m: string } | null>(null);
  const { data, refetch } = useQuery({ queryKey: ['users-mgmt'], queryFn: async () => (await api.get('/users')).data });

  // ── §2 debounced username availability check ──
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(usernameTimer.current);
    const u = normalizeUsername(form.username);
    if (u.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    usernameTimer.current = window.setTimeout(async () => {
      try {
        const { data: res } = await api.get('/users/check-username', { params: { username: u } });
        setUsernameStatus(res.available ? 'available' : 'taken');
      } catch { setUsernameStatus('idle'); }
    }, 350);
    return () => window.clearTimeout(usernameTimer.current);
  }, [form.username]);

  function flash(t: string, m: string) { setMsg({ t, m }); setTimeout(() => setMsg(null), 6000); }

  // ── Stats ──
  const users: Row[] = data || [];
  const stats = {
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    managers: users.filter((u) => u.role === 'manager').length,
    employees: users.filter((u) => u.role === 'employee').length,
  };

  async function create() {
    if (usernameStatus === 'taken') return;
    if (!form.generate && form.password && form.password !== form.confirmPassword) { flash('err', 'تأكيد كلمة المرور غير متطابق'); return; }
    try {
      const body: any = {
        fullName: form.fullName, username: normalizeUsername(form.username),
        password: form.generate ? undefined : form.password, generatePassword: form.generate, role: form.role,
      };
      if (form.phone.trim()) body.phone = form.phone.trim();
      if (form.email.trim()) body.email = form.email.trim();
      const { data } = await api.post('/users', body);
      const detail = data.temporaryPassword
        ? `تم إنشاء الحساب: ${data.username} / ${data.temporaryPassword}`
        : `تم إنشاء الحساب: ${data.username}`;
      flash('ok', detail);
      setForm({ fullName: '', username: '', password: '', confirmPassword: '', role: 'employee', generate: false, phone: '', email: '' });
      setUsernameStatus('idle');
      refetch();
    } catch (e: any) { flash('err', apiError(e)); }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      const body: any = {};
      if (editForm.fullName.trim() && editForm.fullName !== editing.fullName) body.fullName = editForm.fullName.trim();
      if (editForm.phone !== (editing.phone || '')) body.phone = editForm.phone || null;
      if (editForm.email !== (editing.email || '')) body.email = editForm.email || null;
      await api.patch(`/users/${editing.id}`, body);
      flash('ok', 'تم الحفظ'); setEditing(null); refetch();
    } catch (e: any) { flash('err', apiError(e)); }
  }

  async function resetPassword() {
    if (!resetting) return;
    try {
      const body: any = {};
      if (resetForm.generate) {
        body.generateTempPassword = true;
      } else {
        if (!resetForm.password || resetForm.password.length < 4) { flash('err', 'كلمة المرور قصيرة (4 أحرف على الأقل)'); return; }
        body.password = resetForm.password;
      }
      const { data } = await api.patch(`/users/${resetting.id}/reset-password`, body);
      const detail = data.temporaryPassword
        ? `تم إعادة التعيين: ${data.username} / ${data.temporaryPassword}`
        : `تم إعادة تعيين كلمة المرور لـ ${data.username}`;
      flash('ok', detail);
      setResetting(null); setResetForm({ password: '', generate: false }); refetch();
    } catch (e: any) { flash('err', apiError(e)); }
  }

  async function saveRole() {
    if (!changingRole) return;
    try {
      await api.patch(`/users/${changingRole.id}/role`, { role: newRole });
      flash('ok', `تم تغيير دور ${changingRole.username} إلى ${ROLE_AR[newRole]}`);
      setChangingRole(null); refetch();
    } catch (e: any) { flash('err', apiError(e)); }
  }

  async function savePermissions() {
    if (!managingPerms) return;
    try {
      await api.patch(`/users/${managingPerms.id}/permissions`, { permissions: permDraft });
      flash('ok', `تم حفظ صلاحيات ${managingPerms.username}`);
      setManagingPerms(null); refetch();
    } catch (e: any) { flash('err', apiError(e)); }
  }

  async function activateUser(id: string, name: string) {
    if (!confirm(`تفعيل حساب ${name}؟`)) return;
    try { await api.patch(`/users/${id}/activate`); flash('ok', 'تم التفعيل'); refetch(); }
    catch (e: any) { flash('err', apiError(e)); }
  }

  async function disable(id: string, name: string) {
    if (!confirm(`تعطيل حساب ${name}؟`)) return;
    try { await api.delete(`/users/${id}`); flash('ok', 'تم التعطيل'); refetch(); }
    catch (e: any) { flash('err', apiError(e)); }
  }

  // Client-side permission mirrors (backend re-validates everything).
  function canEdit(r: Row): boolean {
    if (!me) return false;
    if (r.isOwner) return me.id === r.id;
    if (me.id === r.id) return true;
    if (me.isOwner) return true;
    return me.role === 'manager' && r.role === 'employee';
  }
  function canDisable(r: Row): boolean {
    if (!me || r.isOwner || me.id === r.id) return false;
    if (me.isOwner) return true;
    return me.role === 'manager' && r.role === 'employee';
  }
  function canResetPassword(r: Row): boolean {
    if (!me || r.isOwner || me.id === r.id) return false;
    if (me.isOwner) return true;
    return me.role === 'manager' && r.role === 'employee';
  }
  function canChangeRole(r: Row): boolean {
    if (!me || r.isOwner || me.id === r.id) return false;
    return me.isOwner; // only Owner can change roles
  }
  function canManagePerms(r: Row): boolean {
    if (!me || r.isOwner || me.id === r.id) return false;
    return me.isOwner; // only Owner can manage permissions
  }

  return (
    <div style={{ padding: 8, display: 'flex', gap: 8 }} dir={dir}>
      <div style={{ flex: 1 }}>
        <h4>المستخدمون — الإدارة</h4>

        {/* ── Stats ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 13 }}>
          <span>المستخدمون: <b>{stats.total}</b></span>
          <span style={{ color: '#2E9E5B' }}>النشطون: <b>{stats.active}</b></span>
          <span style={{ color: '#E5484D' }}>المعطلون: <b>{stats.inactive}</b></span>
          <span>المدراء: <b>{stats.managers}</b></span>
          <span>الموظفون: <b>{stats.employees}</b></span>
        </div>

        {msg && <div className={msg.t === 'err' ? 'kerr' : 'kok'}>{msg.m}</div>}
        <div className="ktable-wrap"><table className="ktable">
          <thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>آخر دخول</th><th></th></tr></thead>
          <tbody>{users.map((r) => (
            <tr key={r.id}>
              <td>{r.fullName} {r.isOwner && <span className="role-badge">المالك</span>}</td>
              <td dir="ltr">{r.username}</td>
              <td>{ROLE_AR[r.role] || r.role}{r.forcePasswordChange ? ' (مؤقتة)' : ''}</td>
              <td>{r.isActive ? 'نشط' : 'معطل'}</td>
              <td style={{ fontSize: 11 }}>{new Date(r.createdAt).toLocaleDateString('ar-EG')}</td>
              <td style={{ fontSize: 11 }}>{r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString('ar-EG') : '—'}</td>
              <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {canEdit(r) && <button className="kbtn" onClick={() => { setEditing(r); setEditForm({ fullName: r.fullName, phone: r.phone || '', email: r.email || '' }); }}>تعديل</button>}
                {canResetPassword(r) && <button className="kbtn" onClick={() => { setResetting(r); setResetForm({ password: '', generate: false }); }}>إعادة تعيين</button>}
                {canChangeRole(r) && <button className="kbtn" onClick={() => { setChangingRole(r); setNewRole(r.role === 'manager' ? 'employee' : 'manager'); }}>الدور</button>}
                {canManagePerms(r) && <button className="kbtn" onClick={() => { setManagingPerms(r); setPermDraft(r.permissions || []); }}>صلاحيات</button>}
                {!r.isActive && canEdit(r) && <button className="kbtn" style={{ color: '#2E9E5B' }} onClick={() => activateUser(r.id, r.fullName)}>تفعيل</button>}
                {canDisable(r) && <button className="kbtn" onClick={() => disable(r.id, r.fullName)}>تعطيل</button>}
              </td>
            </tr>))}</tbody>
        </table></div>

        {/* ── Edit panel ── */}
        {editing && (
          <div className="kpanel" style={{ marginTop: 8 }}>
            <h4>تعديل: {editing.username}</h4>
            <div className="krow"><span className="klabel">الاسم الكامل</span>
              <input className="kinput" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} style={{ width: 200 }} /></div>
            <div className="krow"><span className="klabel">الهاتف</span>
              <input className="kinput" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} style={{ width: 160 }} /></div>
            <div className="krow"><span className="klabel">البريد</span>
              <input className="kinput" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} style={{ width: 200 }} /></div>
            <div className="krow">
              <button className="kbtn kbtn-primary" onClick={saveEdit}>حفظ</button>
              <button className="kbtn" onClick={() => setEditing(null)}>إلغاء</button></div>
          </div>
        )}

        {/* ── Reset password panel ── */}
        {resetting && (
          <div className="kpanel" style={{ marginTop: 8, borderColor: '#F5A623' }}>
            <h4>إعادة تعيين كلمة المرور: {resetting.username}</h4>
            <div className="krow">
              <label><input type="radio" checked={!resetForm.generate} onChange={() => setResetForm({ ...resetForm, generate: false })} /> إدخال كلمة مرور جديدة</label>
              <label style={{ marginRight: 12 }}><input type="radio" checked={resetForm.generate} onChange={() => setResetForm({ ...resetForm, generate: true })} /> توليد كلمة مرور مؤقتة (إجبار التغيير أول دخول)</label>
            </div>
            {!resetForm.generate && (
              <div className="krow"><span className="klabel">كلمة المرور الجديدة</span>
                <input className="kinput" type="text" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} style={{ width: 220 }} /></div>
            )}
            <div className="krow">
              <button className="kbtn kbtn-primary" onClick={resetPassword}>حفظ</button>
              <button className="kbtn" onClick={() => { setResetting(null); setResetForm({ password: '', generate: false }); }}>إلغاء</button>
            </div>
          </div>
        )}

        {/* ── Change role panel ── */}
        {changingRole && (
          <div className="kpanel" style={{ marginTop: 8, borderColor: '#5B8DEF' }}>
            <h4>تغيير دور: {changingRole.username}</h4>
            <div className="krow">
              <label><input type="radio" checked={newRole === 'manager'} onChange={() => setNewRole('manager')} /> مدير</label>
              <label style={{ marginRight: 12 }}><input type="radio" checked={newRole === 'employee'} onChange={() => setNewRole('employee')} /> موظف</label>
            </div>
            <div className="krow">
              <button className="kbtn kbtn-primary" onClick={saveRole}>حفظ</button>
              <button className="kbtn" onClick={() => setChangingRole(null)}>إلغاء</button>
            </div>
          </div>
        )}

        {/* ── Manage permissions panel ── */}
        {managingPerms && (
          <div className="kpanel" style={{ marginTop: 8, borderColor: '#8B5CF6' }}>
            <h4>صلاحيات: {managingPerms.username} ({ROLE_AR[managingPerms.role]})</h4>
            {PERMISSION_CATEGORIES.map((cat) => (
              <div key={cat.labelAr} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{cat.labelAr}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                  {cat.permissions.map((p) => (
                    <label key={p} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <input type="checkbox" checked={permDraft.includes(p)}
                        onChange={(e) => setPermDraft(e.target.checked ? [...permDraft, p] : permDraft.filter((x) => x !== p))} />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="krow">
              <button className="kbtn kbtn-primary" onClick={savePermissions}>حفظ</button>
              <button className="kbtn" onClick={() => setManagingPerms(null)}>إلغاء</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ width: 340 }}>
        <div className="kpanel">
          <h4>حساب جديد</h4>
          <div className="krow"><span className="klabel">الاسم الكامل</span>
            <input className="kinput" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="krow"><span className="klabel">المستخدم</span>
            <input className="kinput" dir="ltr" placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ width: '100%' }} /></div>
          {normalizeUsername(form.username).length >= 3 && (
            <div style={{ fontSize: 12, marginBottom: 4, paddingLeft: 72 }}>
              {usernameStatus === 'checking' && <span style={{ color: 'var(--muted)' }}>جاري التحقق…</span>}
              {usernameStatus === 'available' && <span style={{ color: '#2E9E5B' }}>✓ متاح</span>}
              {usernameStatus === 'taken' && <span style={{ color: '#E5484D' }}>اسم المستخدم مستخدم بالفعل</span>}
            </div>
          )}
          <div className="krow"><span className="klabel">الباسورد</span>
            <input className="kinput" type="text" value={form.generate ? '(توليد تلقائي)' : form.password} disabled={form.generate} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ width: '100%' }} /></div>
          {!form.generate && (
            <div className="krow"><span className="klabel">تأكيد الباسورد</span>
              <input className="kinput" type="text" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} style={{ width: '100%' }} />
              {form.confirmPassword && form.password !== form.confirmPassword && <span style={{ color: '#E5484D', fontSize: 11 }}>غير متطابق</span>}
            </div>
          )}
          <div className="krow"><label><input type="checkbox" checked={form.generate} onChange={(e) => setForm({ ...form, generate: e.target.checked, confirmPassword: '' })} /> توليد باسورد مبدئي (إجبار التغيير أول دخول)</label></div>
          <div className="krow"><span className="klabel">الهاتف</span>
            <input className="kinput" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="krow"><span className="klabel">البريد الإلكتروني</span>
            <input className="kinput" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="krow"><span className="klabel">نوع الحساب</span>
            <label><input type="radio" checked={form.role === 'manager'} onChange={() => setForm({ ...form, role: 'manager' })} /> مدير</label>
            <label><input type="radio" checked={form.role === 'employee'} onChange={() => setForm({ ...form, role: 'employee' })} /> موظف</label></div>
          <button className="kbtn kbtn-primary" disabled={!form.fullName.trim() || normalizeUsername(form.username).length < 3 || usernameStatus === 'taken' || usernameStatus === 'checking' || (!form.generate && form.password !== form.confirmPassword)} onClick={create} style={{ width: '100%' }}>حفظ الحساب</button>
        </div>
      </div>
    </div>
  );
}
