import { create } from 'zustand';
import { api } from '../services/api';

export type RoleName = 'owner' | 'manager' | 'employee';
export interface AuthUser {
  id: string; fullName: string; username: string; role: RoleName;
  permissionLevel: number; isOwner: boolean; forcePasswordChange: boolean;
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  login: (u: AuthUser, t: string) => void;
  logout: (audit?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  init: () => Promise<void>;
}

export const ROLE_AR: Record<RoleName, string> = { owner: 'المالك', manager: 'مدير', employee: 'موظف' };
export const levelAtLeast = (u: AuthUser | null, level: number) => !!u && u.permissionLevel >= level;
/** Check if user has a specific granular permission. Owner always has all. */
export const hasPermission = (u: AuthUser | null, perm: string) => !!u && (u.isOwner || u.permissions.includes(perm));

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  ready: false,
  login: (user, token) => {
    localStorage.setItem('kstore_token', token);
    localStorage.setItem('kstore_user', JSON.stringify(user));
    set({ user, token, ready: true });
  },
  logout: async (audit = true) => {
    const { token } = get();
    if (audit && token) {
      try { await api.post('/auth/logout'); } catch { /* never block logout */ }
    }
    localStorage.removeItem('kstore_token');
    localStorage.removeItem('kstore_user');
    set({ user: null, token: null, ready: true });
  },
  refresh: async () => {
    const { data } = await api.get('/auth/me');
    localStorage.setItem('kstore_user', JSON.stringify(data));
    set({ user: data });
  },
  init: async () => {
    const t = localStorage.getItem('kstore_token');
    if (!t) { set({ ready: true }); return; }
    try {
      // Revalidate stored session against the server (kills stale/demoted sessions).
      const { data } = await api.get('/auth/me');
      localStorage.setItem('kstore_user', JSON.stringify(data));
      set({ user: data, token: t, ready: true });
    } catch {
      localStorage.removeItem('kstore_token');
      localStorage.removeItem('kstore_user');
      set({ user: null, token: null, ready: true });
    }
  },
}));
