import { Check } from 'lucide-react';
import type { NoteColor } from '../../types';
import { NOTE_COLORS, noteColorVar } from '../../lib/constants';
import { cn } from '../../utils/cn';
import styles from './ColorPicker.module.css';

interface ColorPickerProps {
  value: NoteColor;
  onChange: (color: NoteColor) => void;
}

/** Row of sticky-note color swatches. Reused in editor + settings. */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className={styles.row} role="radiogroup" aria-label="Note color">
      {NOTE_COLORS.map((color) => (
        <button
          key={color}
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          className={cn(styles.swatch, value === color && styles.selected)}
          style={{ background: noteColorVar(color) }}
          onClick={() => onChange(color)}
        >
          {value === color && <Check size={13} className={styles.check} />}
        </button>
      ))}
    </div>
  );
}
