import { useEffect, useId, useRef, useState } from 'react';
import { useDir } from '../../store/lang';

export interface SSelectOption {
  value: string;
  label: string;
  hint?: string;
  data?: any;
}

interface Props {
  value: string;
  onChange: (value: string, option?: SSelectOption) => void;
  loadOptions: (query: string, signal: AbortSignal) => Promise<SSelectOption[]>;
  placeholder?: string;
  label?: string;
  allowClear?: boolean;
  debounceMs?: number;
  minChars?: number;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  id?: string;
}

/** Split label around the first case-insensitive match for highlight. */
function Hi({ text, q }: { text: string; q: string }) {
  const t = text || '';
  const needle = (q || '').trim();
  if (!needle) return <>{t}</>;
  const i = t.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return <>{t}</>;
  return (
    <>{t.slice(0, i)}<mark className="sselect-hi">{t.slice(i, i + needle.length)}</mark>{t.slice(i + needle.length)}</>
  );
}

/**
 * ONE reusable async combobox for the whole app (no new deps):
 * type → debounced backend search → arrow/Enter/Escape → select.
 * RTL-first, touch-friendly (44px rows), results panel stays in viewport.
 */
export function SearchableSelect({
  value, onChange, loadOptions, placeholder, label,
  allowClear = true, debounceMs = 300, minChars = 0, disabled, inputRef, id,
}: Props) {
  const dir = useDir();
  const autoId = useId();
  const listId = `${id || autoId}-listbox`;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [options, setOptions] = useState<SSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const reqSeq = useRef(0);

  const selected = options.find((o) => o.value === value);
  // Show the selected label when closed and untouched; free text while typing.
  const display = focused || open ? text : selected?.label || text;

  function run(query: string) {
    window.clearTimeout(timer.current);
    abortRef.current?.abort();
    if (query.trim().length < minChars) { setOptions([]); setLoading(false); setError(''); return; }
    setLoading(true); setError('');
    timer.current = window.setTimeout(async () => {
      const seq = ++reqSeq.current;
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const rows = await loadOptions(query, ctl.signal);
        if (seq !== reqSeq.current || ctl.signal.aborted) return;
        setOptions(rows || []);
        setActive(0);
      } catch (e: any) {
        if (ctl.signal.aborted) return;
        setError('تعذر البحث — حاول مجددًا');
        setOptions([]);
      } finally {
        if (seq === reqSeq.current && !ctl.signal.aborted) setLoading(false);
      }
    }, debounceMs);
  }

  function openWith(query: string) {
    setOpen(true);
    run(query);
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.clearTimeout(timer.current);
      abortRef.current?.abort();
    };
  }, []);

  function choose(o: SSelectOption) {
    setText(o.label);
    setOpen(false);
    onChange(o.value, o);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && !open) { e.preventDefault(); openWith(text); return; }
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) choose(o); }
  }

  return (
    <div ref={rootRef} className="sselect" dir={dir}>
      {label && <span className="klabel">{label}</span>}
      <div className="sselect-box">
        <input
          ref={inputRef}
          className="kinput sselect-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          value={display}
          onChange={(e) => { setText(e.target.value); setFocused(true); openWith(e.target.value); }}
          onFocus={() => { setFocused(true); openWith(text); }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKey}
          onClick={() => { if (!open) openWith(text); }}
        />
        {allowClear && !!value && (
          <button type="button" className="sselect-clear" title="مسح" aria-label="مسح الاختيار"
            onClick={() => { setText(''); setOptions([]); onChange(''); }}>
            ✕
          </button>
        )}
        <span className="sselect-arrow" aria-hidden>▼</span>
      </div>
      {open && (
        <div className="sselect-pop" role="listbox" id={listId}>
          {loading && <div className="sselect-state">جاري البحث…</div>}
          {!loading && error && <div className="sselect-state sselect-error">{error}</div>}
          {!loading && !error && !options.length && <div className="sselect-state">لا نتائج مطابقة</div>}
          {!loading && !error && options.map((o, i) => (
            <div
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`sselect-opt${i === active ? ' active' : ''}${o.value === value ? ' picked' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
            >
              <div className="sselect-label"><Hi text={o.label} q={text} /></div>
              {o.hint && <div className="sselect-hint">{o.hint}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
