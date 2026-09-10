export type Theme = 'light' | 'dark' | 'classic';

const KEY = 'kstore_theme';

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'classic') return saved;
  // Classic WinForms look is the store default.
  return 'classic';
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(KEY, t);
}

export function toggleTheme(): Theme {
  const cur = getTheme();
  const next: Theme = cur === 'classic' ? 'light' : cur === 'light' ? 'dark' : 'classic';
  applyTheme(next);
  return next;
}
