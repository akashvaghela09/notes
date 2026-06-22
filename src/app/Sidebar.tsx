import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Search, FileText, Pin, Trash2, Plus, X, ChevronRight, Clock,
  SquareArrowOutUpRight, Pencil, Copy,
} from 'lucide-react';
import { useNotesStore } from '../store/useNotesStore';
import { useFoldersStore } from '../store/useFoldersStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTabsStore } from '../store/useTabsStore';
import { useUIStore } from '../store/useUIStore';
import { useBootStore } from '../store/useBootStore';
import { foldersRepo } from '../features/folders/repo';
import { FolderTree } from '../features/folders/FolderTree';
import { SidebarItem, Badge, IconButton, ConfirmDialog, Input, Button, ContextMenu } from '../components';
import type { ContextMenuState } from '../components';
import type { Folder, Note } from '../types';
import { noteName } from '../utils/markdown';
import {
  SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_PINNED_LIMIT, SIDEBAR_RECENT_LIMIT,
} from '../lib/constants';
import { cn } from '../utils/cn';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const notes = useNotesStore((s) => s.notes);
  const trashed = useNotesStore((s) => s.trashed);
  const createNote = useNotesStore((s) => s.create);
  const trashNote = useNotesStore((s) => s.trash);
  const setFileName = useNotesStore((s) => s.setFileName);
  const createFolder = useFoldersStore((s) => s.create);
  const removeFolder = useFoldersStore((s) => s.remove);
  const loadNotes = useNotesStore((s) => s.load);
  const openNote = useTabsStore((s) => s.openNote);

  const width = useSettingsStore((s) => s.settings.sidebarWidth);
  const updateSetting = useSettingsStore((s) => s.update);
  const hydrated = useBootStore((s) => s.hydrated);

  const view = useUIStore((s) => s.view);
  const scope = useUIStore((s) => s.scope);
  const searchTerm = useUIStore((s) => s.searchTerm);
  const setSearchTerm = useUIStore((s) => s.setSearchTerm);
  const goHome = useUIStore((s) => s.goHome);
  const goTrash = useUIStore((s) => s.goTrash);
  const setPendingFolderRename = useUIStore((s) => s.setPendingFolderRename);

  const [pendingDelete, setPendingDelete] = useState<{ folder: Folder; count: number } | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const dragging = useRef(false);

  const pinned = notes.filter((n) => n.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const pinnedShown = pinned.slice(0, SIDEBAR_PINNED_LIMIT);

  // Most-recently-edited notes that actually have something in them.
  const recent = notes
    .filter((n) => n.content.trim() !== '' || n.fileName.trim() !== '')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SIDEBAR_RECENT_LIMIT);

  const onNewNote = async () => {
    const folderId = scope.type === 'folder' ? scope.id : undefined;
    const note = await createNote({ folderId });
    await openNote(note.id);
  };

  // --- resize handle ---
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, e.clientX));
      setDragWidth(w);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDragWidth((w) => {
        if (w != null) void updateSetting('sidebarWidth', w);
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [updateSetting]);

  const startDrag = () => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const requestDeleteFolder = async (folder: Folder) => {
    const count = await foldersRepo.noteCount(folder.id);
    setPendingDelete({ folder, count });
  };
  const confirmDeleteFolder = async () => {
    if (!pendingDelete) return;
    await removeFolder(pendingDelete.folder.id);
    await loadNotes();
    if (scope.type === 'folder' && scope.id === pendingDelete.folder.id) goHome({ type: 'all' });
    setPendingDelete(null);
  };

  const isActive = (t: 'all' | 'pinned') => view === 'home' && scope.type === t && !searchTerm;

  const commitRenameNote = () => {
    if (editingNoteId) void setFileName(editingNoteId, noteDraft);
    setEditingNoteId(null);
  };
  const openFileMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open', icon: <SquareArrowOutUpRight size={15} />, onClick: () => void openNote(note.id) },
        { label: 'Rename', icon: <Pencil size={15} />, onClick: () => { setEditingNoteId(note.id); setNoteDraft(noteName(note)); } },
        { label: 'Copy text', icon: <Copy size={15} />, onClick: () => void navigator.clipboard.writeText(note.content) },
        { label: 'Move to Trash', icon: <Trash2 size={15} />, tone: 'danger', separated: true, onClick: () => void trashNote(note.id) },
      ],
    });
  };

  // Pinned/Recent row with the same right-click menu + inline rename as files.
  const renderNoteRow = (note: Note, icon: ReactNode) =>
    editingNoteId === note.id ? (
      <div key={note.id} className={styles.pinRow}>
        {icon}
        <input
          className={styles.renameInput}
          value={noteDraft}
          autoFocus
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={commitRenameNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRenameNote();
            if (e.key === 'Escape') setEditingNoteId(null);
          }}
        />
      </div>
    ) : (
      <button
        key={note.id}
        className={styles.pinRow}
        onClick={() => openNote(note.id)}
        onContextMenu={(e) => openFileMenu(e, note)}
      >
        {icon}
        <span className={styles.pinTitle}>{noteName(note)}</span>
      </button>
    );

  return (
    <aside className={styles.sidebar} style={{ width: dragWidth ?? width }}>
      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} />
        <Input
          id="sidebar-search"
          bare
          className={styles.search}
          placeholder="Search notes…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears the query and exits search mode; if already empty,
            // drop focus so the keystroke reads as "leave search".
            if (e.key === 'Escape') {
              if (searchTerm) setSearchTerm('');
              else e.currentTarget.blur();
            }
          }}
          disabled={!hydrated}
        />
        {searchTerm && (
          <button className={styles.clear} aria-label="Clear" onClick={() => setSearchTerm('')}>
            <X size={14} />
          </button>
        )}
      </div>

      <Button
        variant="primary"
        block
        className={styles.newNote}
        icon={<Plus size={16} />}
        onClick={onNewNote}
        disabled={!hydrated}
      >
        New Note
      </Button>

      <div className={styles.scroll}>
        {/* Static chrome — rendered identically before and after hydration so
            it never shifts. Badges appear only once counts are known. */}
        <nav className={styles.section}>
          <SidebarItem
            icon={<FileText size={16} />}
            label="All Notes"
            active={isActive('all')}
            trailing={hydrated ? <Badge>{notes.length}</Badge> : undefined}
            onClick={() => goHome({ type: 'all' })}
          />
          <SidebarItem
            icon={<Trash2 size={16} />}
            label="Trash"
            active={view === 'trash'}
            trailing={hydrated && trashed.length > 0 ? <Badge tone="danger">{trashed.length}</Badge> : undefined}
            onClick={goTrash}
          />
        </nav>

        {!hydrated ? (
          <div className={styles.skeleton} aria-hidden>
            {[3, 4].map((rows, g) => (
              <div key={g} className={styles.group}>
                <div className={styles.groupHeader}>
                  <span className={styles.skelHead} />
                </div>
                {Array.from({ length: rows }).map((_, i) => (
                  <div key={i} className={styles.skelItem}>
                    <span className={styles.skelDot} />
                    <span className={styles.skelBar} style={{ width: `${50 + ((i * 17) % 35)}%` }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
        <>
        {pinned.length > 0 && (
          <div className={styles.group}>
            <div className={styles.groupHeader}>
              <span className={styles.groupLabel}>
                <Pin size={12} /> Pinned
              </span>
            </div>
            {pinnedShown.map((note) =>
              renderNoteRow(note, <FileText size={14} className={styles.pinIcon} />),
            )}
            {pinned.length > SIDEBAR_PINNED_LIMIT && (
              <button
                className={cn(styles.pinRow, styles.showAll)}
                onClick={() => goHome({ type: 'pinned' })}
              >
                Show all {pinned.length}
                <ChevronRight size={13} />
              </button>
            )}
          </div>
        )}

        {recent.length > 0 && (
          <div className={styles.group}>
            <div className={styles.groupHeader}>
              <span className={styles.groupLabel}>
                <Clock size={12} /> Recent
              </span>
            </div>
            {recent.map((note) =>
              renderNoteRow(note, <FileText size={14} className={styles.pinIcon} />),
            )}
          </div>
        )}

        <div className={styles.foldersGroup}>
          <div className={styles.groupHeader}>
            <span className={styles.groupLabel}>Folders</span>
            <IconButton
              label="New folder"
              size="sm"
              onClick={async () => {
                const folder = await createFolder('Untitled folder');
                setPendingFolderRename(folder.id);
              }}
            >
              <Plus size={15} />
            </IconButton>
          </div>
          <div className={styles.folderScroll}>
            <FolderTree onRequestDelete={requestDeleteFolder} />
          </div>
        </div>
        </>
        )}
      </div>

      <div className={styles.resizer} onMouseDown={startDrag} aria-hidden />

      <ContextMenu state={menu} onClose={() => setMenu(null)} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete folder?"
        message={
          pendingDelete
            ? pendingDelete.count > 0
              ? `"${pendingDelete.folder.name}" and its subfolders will be deleted. The ${pendingDelete.count} note(s) inside will move to your default folder; they won’t be deleted.`
              : `Delete the empty folder "${pendingDelete.folder.name}"?`
            : ''
        }
        confirmLabel="Delete folder"
        tone="danger"
        onConfirm={confirmDeleteFolder}
        onCancel={() => setPendingDelete(null)}
      />
    </aside>
  );
}
