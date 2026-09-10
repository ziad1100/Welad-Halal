import { api } from './api';
import type { SSelectOption } from '../components/shared/SearchableSelect';

async function get(path: string, params: any, signal: AbortSignal) {
  const { data } = await api.get(path, { params, signal: signal as any });
  return data;
}

/** Backend-efficient option loaders (server search, small takes). */
export const lookupCustomers = (take = 20) =>
  async (q: string, signal: AbortSignal): Promise<SSelectOption[]> => {
    const rows = await get('/customers', { search: q || undefined }, signal);
    return (rows || []).slice(0, take).map((c: any) => ({
      value: c.id, label: c.name, hint: c.phone || '', data: c,
    }));
  };

export const lookupProducts = (take = 20) =>
  async (q: string, signal: AbortSignal): Promise<SSelectOption[]> => {
    const rows = await get('/products', { search: q || undefined, take }, signal);
    return (rows || []).slice(0, take).map((p: any) => ({
      value: p.id, label: p.nameAr || p.name,
      hint: [p.barcode, p.retailPrice !== undefined ? `${Number(p.retailPrice)} ج.م` : ''].filter(Boolean).join(' · '),
      data: p,
    }));
  };

export const lookupSuppliers = (take = 20) =>
  async (q: string, signal: AbortSignal): Promise<SSelectOption[]> => {
    const rows = await get('/suppliers', { search: q || undefined }, signal);
    return (rows || []).slice(0, take).map((s: any) => ({
      value: s.id, label: s.name, hint: s.phone || '', data: s,
    }));
  };

export const lookupReps = () =>
  async (q: string, signal: AbortSignal): Promise<SSelectOption[]> => {
    const rows = await get('/users/reps', {}, signal);
    const needle = (q || '').trim().toLowerCase();
    return (rows || [])
      .filter((r: any) => !needle
        || (r.fullName || '').toLowerCase().includes(needle)
        || (r.username || '').toLowerCase().includes(needle))
      .map((r: any) => ({ value: r.id, label: r.fullName || r.username, hint: r.username, data: r }));
  };

export const lookupEmployees = () =>
  async (q: string, signal: AbortSignal): Promise<SSelectOption[]> => {
    const rows = await get('/shifts/employees', {}, signal);
    const needle = (q || '').trim().toLowerCase();
    return (rows || [])
      .filter((e: any) => !needle
        || (e.fullName || e.user?.fullName || '').toLowerCase().includes(needle)
        || (e.user?.username || '').toLowerCase().includes(needle))
      .map((e: any) => ({
        value: e.userId || e.id, label: e.fullName || e.user?.fullName || e.user?.username || e.id,
        hint: e.user?.username || '', data: e,
      }));
  };

export const lookupBundles = () =>
  async (q: string, signal: AbortSignal): Promise<SSelectOption[]> => {
    const rows = await get('/manufacturing/bundles', {}, signal);
    const needle = (q || '').trim().toLowerCase();
    return (rows || [])
      .filter((p: any) => !needle || (p.nameAr || p.name || '').toLowerCase().includes(needle))
      .map((p: any) => ({ value: p.id, label: p.nameAr || p.name, hint: p.barcode || '', data: p }));
  };

/** Categories have no backend search (small list) — local filter over one fetch. */
export function lookupCategoriesLocal(cats: any[]) {
  return async (q: string): Promise<SSelectOption[]> => {
    const needle = (q || '').trim().toLowerCase();
    return (cats || [])
      .filter((c: any) => !needle
        || (c.nameAr || '').toLowerCase().includes(needle)
        || (c.name || '').toLowerCase().includes(needle))
      .map((c: any) => ({ value: c.id, label: c.nameAr || c.name, data: c }));
  };
}
