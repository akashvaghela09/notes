import { useLayoutEffect } from 'react';
import type { ResolvedTheme, ThemePref } from '../types';

/** Resolve a theme preference to a concrete theme, following the OS when
 *  set to 'system'. Applies it to <html data-theme> before paint (so there's
 *  no flash), and mirrors the preference to localStorage so the inline boot
 *  script in index.html can apply the right theme on the next launch. */
export function useTheme(pref: ThemePref): void {
  useLayoutEffect(() => {
    try {
      localStorage.setItem('notes:theme', pref);
    } catch {
      /* ignore storage failures */
    }

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved: ResolvedTheme =
        pref === 'system' ? (mql.matches ? 'dark' : 'light') : pref;
      document.documentElement.setAttribute('data-theme', resolved);
    };

    apply();
    if (pref === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
  }, [pref]);
}
