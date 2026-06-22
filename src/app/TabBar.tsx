import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTabsStore } from '../store/useTabsStore';
import { useNotesStore } from '../store/useNotesStore';
import { useUIStore } from '../store/useUIStore';
import { useBootStore } from '../store/useBootStore';
import { draftsRepo } from '../features/drafts/repo';
import { notesRepo } from '../features/notes/repo';
import { noteName } from '../utils/markdown';
import { useHotkeys } from '../hooks/useHotkeys';
import { ConfirmDialog, Tooltip } from '../components';
import { cn } from '../utils/cn';
import styles from './TabBar.module.css';

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const dirty = useTabsStore((s) => s.dirty);
  const liveTitles = useTabsStore((s) => s.liveTitles);
  const activate = useTabsStore((s) => s.activate);
  const closeTab = useTabsStore((s) => s.closeTab);
  const openNote = useTabsStore((s) => s.openNote);
  const setDirty = useTabsStore((s) => s.setDirty);

  const notes = useNotesStore((s) => s.notes);
  const trashed = useNotesStore((s) => s.trashed);
  const createNote = useNotesStore((s) => s.create);
  const reloadNotes = useNotesStore((s) => s.load);

  const view = useUIStore((s) => s.view);
  const hydrated = useBootStore((s) => s.hydrated);

  const [closing, setClosing] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible when tabs overflow horizontally.
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTabId, tabs.length]);

  // Let a vertical mouse wheel scroll the tab strip horizontally.
  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY !== 0 && tabsRef.current) tabsRef.current.scrollLeft += e.deltaY;
  };

  const all = [...notes, ...trashed];
  const noteTitle = (noteId: string) => {
    const n = all.find((x) => x.id === noteId);
    // A user-set file name wins; otherwise reflect the live first line as typed.
    if (n && n.fileName.trim()) return n.fileName.trim();
    if (liveTitles[noteId] !== undefined) return liveTitles[noteId] || 'Untitled';
    return (n && noteName(n)) || 'Untitled';
  };

  const onNewNote = async () => {
    const note = await createNote();
    await openNote(note.id);
  };

  const requestClose = (tabId: string, noteId: string) => {
    if (dirty.has(noteId)) setClosing(tabId);
    else void closeTab(tabId);
  };

  // Switch to the next/previous tab, wrapping around.
  const cycleTab = (delta: number) => {
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const base = idx === -1 ? 0 : idx;
    const next = (base + delta + tabs.length) % tabs.length;
    activate(tabs[next].id);
  };

  useHotkeys([
    // Ctrl/Cmd+Shift+Backspace closes the current note (Ctrl+Backspace is left to
    // the textarea for delete-word). Pops the unsaved-changes dialog if needed.
    {
      key: 'backspace',
      shift: true,
      handler: (e) => {
        if (view !== 'editor') return;
        const tab = tabs.find((t) => t.id === activeTabId);
        if (!tab) return;
        e.preventDefault();
        requestClose(tab.id, tab.noteId);
      },
    },
    // Ctrl/Cmd+Tab cycles tabs forward, +Shift cycles backward.
    { key: 'tab', handler: (e) => { e.preventDefault(); cycleTab(1); } },
    { key: 'tab', shift: true, handler: (e) => { e.preventDefault(); cycleTab(-1); } },
  ]);

  const closingNoteId = tabs.find((t) => t.id === closing)?.noteId ?? null;

  const finalize = async (action: 'save' | 'discard') => {
    if (!closing || !closingNoteId) return;
    if (action === 'save') {
      const draft = await draftsRepo.get(closingNoteId);
      if (draft) await notesRepo.commit(closingNoteId, draft.title, draft.content);
    }
    await draftsRepo.clear(closingNoteId);
    setDirty(closingNoteId, false);
    await closeTab(closing);
    await reloadNotes();
    setClosing(null);
  };

  return (
    <div className={styles.bar} data-tauri-drag-region>
      <div className={styles.tabs} ref={tabsRef} onWheel={onWheel}>
        {!hydrated && (
          <div className={cn(styles.tab, styles.active)} aria-hidden>
            <span className={styles.tabSkeleton} />
          </div>
        )}
        {tabs.map((tab) => {
          const isActive = view === 'editor' && tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-active={isActive ? 'true' : undefined}
              className={cn(styles.tab, isActive && styles.active)}
              onClick={() => activate(tab.id)}
              onAuxClick={(e) => e.button === 1 && requestClose(tab.id, tab.noteId)}
              title={noteTitle(tab.noteId)}
            >
              {dirty.has(tab.noteId) && <span className={styles.dirtyDot} />}
              <span className={styles.tabTitle}>{noteTitle(tab.noteId)}</span>
              <button
                className={styles.close}
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  requestClose(tab.id, tab.noteId);
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <Tooltip label="New note  ·  Ctrl+N">
        <button className={styles.newBtn} onClick={onNewNote} aria-label="New note" disabled={!hydrated}>
          <Plus size={16} />
        </button>
      </Tooltip>

      <ConfirmDialog
        open={closing !== null}
        title="Unsaved changes"
        message={`"${closingNoteId ? noteTitle(closingNoteId) : ''}" has an unsaved draft. Save your changes before closing, or discard the draft to revert to the last saved version.`}
        confirmLabel="Save & Close"
        altLabel="Discard"
        cancelLabel="Cancel"
        tone="primary"
        onConfirm={() => finalize('save')}
        onAlt={() => finalize('discard')}
        onCancel={() => setClosing(null)}
      />
    </div>
  );
}
