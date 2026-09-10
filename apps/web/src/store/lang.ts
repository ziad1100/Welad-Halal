import { create } from 'zustand';

export type Lang = 'ar' | 'en';
const KEY = 'kstore_lang';

export function getLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return 'ar'; // Arabic is the default UI language per spec
}

/** §8 — receipts keep printing Arabic; only UI chrome flips. */
export function applyLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  document.documentElement.setAttribute('lang', lang === 'ar' ? 'ar' : 'en');
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  // CSS directionality: mirrored table columns, forms, icons via data attribute.
  document.body.setAttribute('data-lang', lang);
}

interface LangState {
  lang: Lang;
  set: (l: Lang) => void;
}
export const useLang = create<LangState>((set) => ({
  lang: getLang(),
  set: (l) => { applyLang(l); set({ lang: l }); },
}));

/** §8 — convenience hook returning the current text direction from the lang store. */
export function useDir(): 'rtl' | 'ltr' {
  return useLang((s) => (s.lang === 'ar' ? 'rtl' : 'ltr'));
}
