import { Pin, Check } from 'lucide-react';
import type { DragEvent, MouseEvent } from 'react';
import type { Note } from '../../types';
import { noteName, previewText } from '../../utils/markdown';
import { smartDate } from '../../utils/time';
import { cn } from '../../utils/cn';
import styles from './NoteListRow.module.css';

interface NoteListRowProps {
  note: Note;
  folderName?: string;
  dirty?: boolean;
  selected?: boolean;
  selecting?: boolean;
  onClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onToggleSelect: (e: MouseEvent) => void;
  onDragStart?: (e: DragEvent) => void;
}

/** Dense list row for Home list mode. Supports Explorer-style selection. */
export function NoteListRow({
  note, folderName, dirty, selected, selecting, onClick, onContextMenu, onToggleSelect, onDragStart,
}: NoteListRowProps) {
  const title = noteName(note);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!onDragStart}
      className={cn(styles.row, selected && styles.selected)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onKeyDown={(e) => e.key === 'Enter' && onClick(e as unknown as MouseEvent)}
    >
      {selecting ? (
        <span
          role="checkbox"
          aria-checked={!!selected}
          className={cn(styles.checkbox, styles.checkboxVisible, selected && styles.checked)}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
        >
          {selected && <Check size={11} />}
        </span>
      ) : (
        <span className={styles.checkbox} aria-hidden />
      )}
      <span className={styles.main}>
        <span className={styles.titleLine}>
          {note.pinned && <Pin size={12} className={styles.pin} fill="currentColor" />}
          <span className={styles.title}>{title}</span>
          {dirty && <span className={styles.dot} title="Unsaved draft" />}
        </span>
        <span className={styles.preview}>{previewText(note.content, 120) || 'No additional text'}</span>
      </span>
      {folderName && <span className={cn(styles.cell, styles.folder)}>{folderName}</span>}
      <span className={styles.cell}>{smartDate(note.createdAt)}</span>
      <span className={styles.cell}>{smartDate(note.updatedAt)}</span>
    </div>
  );
}
