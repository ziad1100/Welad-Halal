import { create } from 'zustand';

export interface AuthUser { id: string; name: string; username: string; role: 'ADMIN' | 'MANAGER' | 'CASHIER'; }

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  login: (u: AuthUser, t: string) => void;
  logout: () => void;
  init: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,
  login: (user, token) => {
    localStorage.setItem('kstore_token', token);
    localStorage.setItem('kstore_user', JSON.stringify(user));
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('kstore_token');
    localStorage.removeItem('kstore_user');
    set({ user: null, token: null });
  },
  init: () => {
    const t = localStorage.getItem('kstore_token');
    const u = localStorage.getItem('kstore_user');
    if (t && u) {
      try { set({ token: t, user: JSON.parse(u) }); } catch { /* ignore */ }
    }
  },
}));
