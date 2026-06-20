import type { ReactNode } from 'react';
import { Check, CircleDashed, Circle } from 'lucide-react';
import type { SaveState } from '../../hooks/useDraft';
import styles from './SaveStatePill.module.css';

const META: Record<SaveState, { label: string; cls: string; icon: ReactNode }> = {
  clean: { label: 'Saved', cls: 'clean', icon: <Check size={13} /> },
  saving: { label: 'Saving draft…', cls: 'saving', icon: <CircleDashed size={13} /> },
  dirty: { label: 'Unsaved changes', cls: 'dirty', icon: <Circle size={9} /> },
  saved: { label: 'Saved', cls: 'saved', icon: <Check size={13} /> },
};

/** The save-state indicator from DESIGN.md §7. Honest, quiet status. */
export function SaveStatePill({ state }: { state: SaveState }) {
  const m = META[state];
  return (
    <span className={`${styles.pill} ${styles[m.cls]}`} aria-live="polite">
      <span className={styles.icon}>{m.icon}</span>
      {m.label}
    </span>
  );
}
