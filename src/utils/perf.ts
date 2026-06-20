// Lightweight launch-timing instrumentation. Each mark logs ms-since-page-load
// (performance.now() is relative to navigation start) plus the delta from the
// previous mark, so the console shows exactly where startup time goes.
//
// Enabled in dev automatically; in a production build, flip it on at runtime
// with localStorage.setItem('notes:perf', '1') then reload.

const ENABLED =
  import.meta.env.DEV ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('notes:perf') === '1');

let last = 0;

/** Record a named timing point. No-op unless instrumentation is enabled. */
export function mark(label: string): void {
  if (!ENABLED) return;
  const t = performance.now();
  // eslint-disable-next-line no-console
  console.info(`[perf] ${label.padEnd(22)}${t.toFixed(1).padStart(8)}ms  (+${(t - last).toFixed(1)}ms)`);
  last = t;
}

/** Record a mark after the next paint (double rAF ≈ post-commit/paint). */
export function markPaint(label: string): void {
  if (!ENABLED) return;
  requestAnimationFrame(() => requestAnimationFrame(() => mark(label)));
}
