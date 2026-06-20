import { Loader2 } from 'lucide-react';
import styles from './Spinner.module.css';

/** Indeterminate spinner. Used sparingly — the app aims to feel instant. */
export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className={styles.spin} aria-label="Loading" />;
}
