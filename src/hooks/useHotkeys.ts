import { useEffect } from 'react';

export interface Hotkey {
  /** Lowercase key, e.g. 's', 'n', '\\', ','. */
  key: string;
  /** Require Ctrl (Linux) / Cmd (mac). Defaults true for app shortcuts. */
  mod?: boolean;
  shift?: boolean;
  /** Require Alt/Option. Defaults false — combos with Alt held never match. */
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
}

/** Register global keyboard shortcuts (DESIGN.md §9). Pass a stable array. */
export function useHotkeys(hotkeys: Hotkey[]): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      for (const hk of hotkeys) {
        const wantMod = hk.mod ?? true;
        if (
          e.key.toLowerCase() === hk.key &&
          wantMod === mod &&
          (hk.shift ?? false) === e.shiftKey &&
          (hk.alt ?? false) === e.altKey
        ) {
          hk.handler(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys]);
}
