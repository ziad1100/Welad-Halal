/** Latin numerals + ج.م suffix, e.g. 140 ج.م — even inside RTL Arabic UI. */
export function formatEGP(n: number | string, digits = 2): string {
  const v = Number(n);
  if (Number.isNaN(v)) return `0 ج.م`;
  return `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ج.م`;
}
export function formatQty(n: number | string): string {
  const v = Number(n);
  return Number.isNaN(v) ? '0' : String(Math.round(v * 1000) / 1000);
}
