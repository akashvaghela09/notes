import { useState } from 'react';
import { Trash2, RotateCcw, X, Trash as TrashIcon } from 'lucide-react';
import { useNotesStore } from '../../store/useNotesStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Button, EmptyState, IconButton, ConfirmDialog, Badge } from '../../components';
import { TRASH_RETENTION_LABELS } from '../../lib/constants';
import { noteName } from '../../utils/markdown';
import { relativeTime } from '../../utils/time';
import styles from './Trash.module.css';

export function Trash() {
  const trashed = useNotesStore((s) => s.trashed);
  const restore = useNotesStore((s) => s.restore);
  const deleteForever = useNotesStore((s) => s.deleteForever);
  const emptyTrash = useNotesStore((s) => s.emptyTrash);
  const retention = useSettingsStore((s) => s.settings.trashRetention);

  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className={styles.trash}>
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Trash</h1>
          {trashed.length > 0 && <Badge tone="danger">{trashed.length}</Badge>}
        </div>
        {trashed.length > 0 && (
          <Button variant="danger" size="sm" icon={<TrashIcon size={15} />} onClick={() => setConfirmEmpty(true)}>
            Empty Trash
          </Button>
        )}
      </header>

      <p className={styles.policy}>
        Notes here are kept until you delete them. Auto-empty:{' '}
        <strong>{TRASH_RETENTION_LABELS[retention]}</strong> (change in Settings).
      </p>

      {trashed.length === 0 ? (
        <EmptyState icon={<Trash2 size={40} />} title="Trash is empty" description="Deleted notes will appear here and can be restored." />
      ) : (
        <div className={styles.list}>
          {trashed.map((note) => (
            <div key={note.id} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.noteTitle}>{noteName(note)}</span>
                <span className={styles.meta}>Trashed {note.trashedAt ? relativeTime(note.trashedAt) : ''}</span>
              </div>
              <div className={styles.actions}>
                <IconButton label="Restore" size="sm" onClick={() => void restore(note.id)}>
                  <RotateCcw size={16} />
                </IconButton>
                <IconButton label="Delete forever" size="sm" tone="danger" onClick={() => setConfirmDelete(note.id)}>
                  <X size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmEmpty}
        title="Empty Trash?"
        message={`Permanently delete all ${trashed.length} note(s) in Trash. This cannot be undone.`}
        confirmLabel="Empty Trash"
        tone="danger"
        onConfirm={() => { void emptyTrash(); setConfirmEmpty(false); }}
        onCancel={() => setConfirmEmpty(false)}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete forever?"
        message="This note will be permanently deleted. This cannot be undone."
        confirmLabel="Delete forever"
        tone="danger"
        onConfirm={() => { if (confirmDelete) void deleteForever(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
