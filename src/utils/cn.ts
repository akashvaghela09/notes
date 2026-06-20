/** Tiny classNames joiner. Filters falsy values so callers can do
 *  cn(styles.base, active && styles.active, className). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
