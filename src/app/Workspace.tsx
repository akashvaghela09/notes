import { useTabsStore } from '../store/useTabsStore';
import { useNotesStore } from '../store/useNotesStore';
import { useUIStore } from '../store/useUIStore';
import { useBootStore } from '../store/useBootStore';
import { Home } from '../features/home/Home';
import { Trash } from '../features/trash/Trash';
import { Editor } from '../features/editor/Editor';
import { BootEditor } from '../features/editor/BootEditor';
import styles from './Workspace.module.css';

export function Workspace() {
  const view = useUIStore((s) => s.view);
  const hydrated = useBootStore((s) => s.hydrated);
  const bootContent = useBootStore((s) => s.bootContent);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const tabs = useTabsStore((s) => s.tabs);
  const notes = useNotesStore((s) => s.notes);

  const activeNoteId = tabs.find((t) => t.id === activeTabId)?.noteId ?? null;
  const activeNote = activeNoteId ? notes.find((n) => n.id === activeNoteId) ?? null : null;

  let content;
  if (!hydrated) {
    // Instant, typeable surface while SQLite connects in the background.
    content = <BootEditor />;
  } else if (view === 'trash') {
    content = <Trash />;
  } else if (view === 'editor' && activeNote) {
    // key by note id so switching notes mounts a fresh draft controller.
    // seedContent (only ever set for the first note) carries any keystrokes
    // typed into the BootEditor before this note existed.
    content = <Editor key={activeNote.id} note={activeNote} seedContent={bootContent || undefined} />;
  } else {
    content = <Home />;
  }

  return <main className={styles.workspace}>{content}</main>;
}
