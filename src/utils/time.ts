// Date/time helpers built on the platform's Intl APIs (zero bundle cost) —
// no date library. Formatters are created once and reused.

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const monthDayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthDayYearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** Current epoch milliseconds. Centralized so call sites stay consistent. */
export const now = (): number => Date.now();

/** Compact relative time for cards/rows, e.g. "2h ago", "3d ago". */
export function relativeTime(ms: number): string {
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}

/** Human date adapting precision to recency. */
export function smartDate(ms: number): string {
  const d = new Date(ms);
  const n = new Date();
  if (d.toDateString() === n.toDateString()) return timeFmt.format(d); // 4:30 PM
  if (d.getFullYear() === n.getFullYear()) return monthDayFmt.format(d); // Jun 17
  return monthDayYearFmt.format(d); // Jun 17, 2024
}

/** Full timestamp for tooltips / detail rows, e.g. "Jun 17, 2024 at 4:30 PM". */
export function fullDate(ms: number): string {
  const d = new Date(ms);
  return `${monthDayYearFmt.format(d)} at ${timeFmt.format(d)}`;
}

/** Filesystem-safe timestamp for export filenames, e.g. "2024-06-17_1630". */
export function fileStamp(ms: number = now()): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
