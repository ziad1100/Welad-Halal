import { useEffect, useRef } from 'react';

/**
 * HID barcode-scanner detection: scanners "type" digits + Enter in an
 * ultra-fast burst (<40ms between keys). Human typing is slower.
 * Calls onScan(code) and suppresses the trailing Enter.
 */
export function useBarcodeScanner(onScan: (code: string) => void, opts?: { minLen?: number; maxGapMs?: number; enabled?: boolean }) {
  const ref = useRef({ buf: '', last: 0 });
  const cb = useRef(onScan);
  cb.current = onScan;
  const minLen = opts?.minLen ?? 4;
  const maxGap = opts?.maxGapMs ?? 40;
  const enabled = opts?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA') return;
      const now = performance.now();
      const st = ref.current;
      if (now - st.last > maxGap * 4) st.buf = '';
      st.last = now;
      if (e.key === 'Enter') {
        if (st.buf.length >= minLen) {
          e.preventDefault();
          e.stopPropagation();
          const code = st.buf;
          st.buf = '';
          cb.current(code);
        } else st.buf = '';
        return;
      }
      if (e.key.length === 1 && /[0-9]/.test(e.key)) st.buf += e.key;
      else if (e.key.length === 1) st.buf = '';
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, minLen, maxGap]);
}

/** Short cashier-style beep on successful scan (WebAudio, no assets). */
export function beep(ok = true) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 1567 : 440;
    o.type = 'sine';
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    o.start();
    o.stop(ctx.currentTime + 0.09);
    setTimeout(() => ctx.close(), 200);
  } catch { /* audio unavailable — ignore */ }
}
