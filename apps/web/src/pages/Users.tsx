import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../services/api';
import { useAuth, ROLE_AR, type RoleName } from '../store/auth';

interface Row {
  id: string; fullName: string; username: string; role: RoleName;
  permissionLevel: number; isOwner: boolean; isActive: boolean; forcePasswordChange: boolean;
}

function suggestUsername(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || 'user';
  return `${first}@weladhalal.pos`;
}

export function UserManagementPage() {
  const { user: me } = useAuth();
  const [form, setForm] = useState({ fullName: '', username: '', password: '', role: 'employee' as RoleName, generate: false });
  const [editing, setEditing] = useState<Row | null>(null);
  const [editName, setEditName] = useState('');
  const [msg, setMsg] = useState<{ t: string; m: string } | null>(null);
  const { data, refetch } = useQuery({ queryKey: ['users-mgmt'], queryFn: async () => (await api.get('/users')).data });

  function flash(t: string, m: string) { setMsg({ t, m }); setTimeout(() => setMsg(null), 5000); }

  async function create() {
    try {
      const { data } = await api.post('/users', {
        fullName: form.fullName, username: form.username.trim() || suggestUsername(form.fullName),
        password: form.generate ? undefined : form.password, generatePassword: form.generate, role: form.role,
      });
      flash('ok', data.temporaryPassword ? `تم الإنشاء — كلمة المرور المؤقتة: ${data.temporaryPassword} (انسخها الآن)` : 'تم إنشاء الحساب');
      setForm({ fullName: '', username: '', password: '', role: 'employee', generate: false });
      refetch();
    } catch (e: any) { flash('err', apiError(e)); }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      const body: any = {};
      if (editName.trim() && editName !== editing.fullName) body.fullName = editName.trim();
      await api.patch(`/users/${editing.id}`, body);
      flash('ok', 'تم الحفظ'); setEditing(null); refetch();
    } catch (e: any) { flash('err', apiError(e)); }
  }

  async function disable(id: string, name: string) {
    if (!confirm(`تعطيل حساب ${name}؟`)) return;
    try { await api.delete(`/users/${id}`); flash('ok', 'تم التعطيل'); refetch(); }
    catch (e: any) { flash('err', apiError(e)); }
  }

  // Client-side mirror of the Part 3 matrix (backend re-validates everything).
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

  return (
    <div style={{ padding: 8, display: 'flex', gap: 8 }} dir="rtl">
      <div style={{ flex: 1 }}>
        <h4>المستخدمون — الإدارة</h4>
        {msg && <div className={msg.t === 'err' ? 'kerr' : 'kok'}>{msg.m}</div>}
        <div className="ktable-wrap"><table className="ktable">
          <thead><tr><th>الاسم الكامل</th><th>المستخدم</th><th>النوع</th><th>الحالة</th><th></th></tr></thead>
          <tbody>{(data || []).map((r: Row) => (
            <tr key={r.id}>
              <td>{r.fullName} {r.isOwner && <span className="role-badge">المالك</span>}</td>
              <td dir="ltr">{r.username}</td>
              <td>{ROLE_AR[r.role] || r.role}{r.forcePasswordChange ? ' (مؤقتة)' : ''}</td>
              <td>{r.isActive ? 'نشط' : 'معطل'}</td>
              <td style={{ display: 'flex', gap: 4 }}>
                {canEdit(r) && <button className="kbtn" onClick={() => { setEditing(r); setEditName(r.fullName); }}>تعديل</button>}
                {canDisable(r) && <button className="kbtn" onClick={() => disable(r.id, r.fullName)}>تعطيل</button>}
              </td>
            </tr>))}</tbody>
        </table></div>
        {editing && (
          <div className="kpanel" style={{ marginTop: 8 }}>
            <h4>تعديل: {editing.username}</h4>
            <div className="krow"><span className="klabel">الاسم الكامل</span>
              <input className="kinput" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: 220 }} />
              <button className="kbtn kbtn-primary" onClick={saveEdit}>حفظ</button>
              <button className="kbtn" onClick={() => setEditing(null)}>إلغاء</button></div>
          </div>
        )}
      </div>
      <div style={{ width: 330 }}>
        <div className="kpanel">
          <h4>حساب جديد</h4>
          <div className="krow"><span className="klabel">الاسم الكامل</span>
            <input className="kinput" value={form.fullName} onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, fullName: v, username: f.username || suggestUsername(v) }));
            }} style={{ width: '100%' }} /></div>
          <div className="krow"><span className="klabel">المستخدم</span>
            <input className="kinput" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="krow"><span className="klabel">الباسورد</span>
            <input className="kinput" type="text" value={form.generate ? '(توليد تلقائي)' : form.password} disabled={form.generate} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="krow"><label><input type="checkbox" checked={form.generate} onChange={(e) => setForm({ ...form, generate: e.target.checked })} /> توليد باسورد مبدئي (إجبار التغيير أول دخول)</label></div>
          <div className="krow"><span className="klabel">نوع الحساب</span>
            <label><input type="radio" checked={form.role === 'manager'} onChange={() => setForm({ ...form, role: 'manager' })} /> مدير</label>
            <label><input type="radio" checked={form.role === 'employee'} onChange={() => setForm({ ...form, role: 'employee' })} /> موظف</label></div>
          <button className="kbtn kbtn-primary" disabled={!form.fullName.trim()} onClick={create} style={{ width: '100%' }}>حفظ الحساب</button>
        </div>
      </div>
    </div>
  );
}
