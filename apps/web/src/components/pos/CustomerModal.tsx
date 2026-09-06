import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '../../services/api';
import { Modal } from '../shared/ui';

export function CustomerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (c: any) => void }) {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [err, setErr] = useState('');
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get('/customers', { params: { search } })).data,
  });

  async function create() {
    setErr('');
    try {
      const { data } = await api.post('/customers', form);
      onSelect(data);
    } catch (e: any) { setErr(apiError(e)); }
  }

  return (
    <Modal title="اختيار عميل (F2)" onClose={onClose}>
      {err && <div className="kerr">{err}</div>}
      <div className="krow">
        <input className="kinput" placeholder="بحث بالاسم أو الهاتف" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
        <button className="kbtn" onClick={() => refetch()}>{isFetching ? '...' : 'بحث'}</button>
      </div>
      <div className="ktable-wrap" style={{ maxHeight: 220 }}>
        <table className="ktable">
          <thead><tr><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th></th></tr></thead>
          <tbody>
            {(data || []).map((c: any) => (
              <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.address}</td>
                <td><button className="kbtn" onClick={() => onSelect(c)}>اختيار</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>عميل جديد</h4>
      <div className="krow">
        <input className="kinput" placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="kinput" placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="kinput" placeholder="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <button className="kbtn kbtn-primary" onClick={create}>حفظ واختيار</button>
      </div>
    </Modal>
  );
}
