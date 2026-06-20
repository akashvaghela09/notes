import { Pin, Check } from 'lucide-react';
import type { DragEvent, MouseEvent } from 'react';
import type { Note } from '../../types';
import { noteColorVar } from '../../lib/constants';
import { noteName, previewText } from '../../utils/markdown';
import { relativeTime } from '../../utils/time';
import { cn } from '../../utils/cn';
import styles from './StickyNote.module.css';

interface StickyNoteProps {
  note: Note;
  folderName?: string;
  dirty?: boolean;
  selected?: boolean;
  /** Whether a multi-selection (2+) is active — only then are checkboxes shown. */
  selecting?: boolean;
  onClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onToggleSelect: (e: MouseEvent) => void;
  onDragStart?: (e: DragEvent) => void;
}

/** Sticky-note card for the Home grid. Supports Explorer-style selection. */
export function StickyNote({
  note, folderName, dirty, selected, selecting, onClick, onContextMenu, onToggleSelect, onDragStart,
}: StickyNoteProps) {
  const title = noteName(note);
  const preview = previewText(note.content, 200);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!onDragStart}
      className={cn(styles.card, note.color === 'default' && styles.bordered, selected && styles.selected)}
      style={{ background: noteColorVar(note.color) }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onKeyDown={(e) => e.key === 'Enter' && onClick(e as unknown as MouseEvent)}
    >
      <span
        role="checkbox"
        aria-checked={!!selected}
        className={cn(styles.checkbox, selecting && styles.checkboxVisible, selected && styles.checked)}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
      >
        {selected && <Check size={12} />}
      </span>

      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        {note.pinned && <Pin size={13} className={styles.pin} fill="currentColor" />}
      </div>
      {preview ? (
        <p className={styles.preview}>{preview}</p>
      ) : (
        <p className={cn(styles.preview, styles.empty)}>No additional text</p>
      )}
      <div className={styles.foot}>
        {folderName && <span className={styles.folder}>{folderName}</span>}
        <span className={styles.time}>
          {dirty && <span className={styles.dot} title="Unsaved draft" />}
          {relativeTime(note.updatedAt)}
        </span>
      </div>
    </div>
  );
}
