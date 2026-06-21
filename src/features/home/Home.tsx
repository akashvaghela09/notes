import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import {
  LayoutGrid, List, ArrowDownNarrowWide, ArrowUpNarrowWide, NotebookPen, SearchX,
  Copy, Download, Trash2, X, SquareArrowOutUpRight, ChevronRight, ChevronDown, Check,
  Folder as FolderIcon, FolderPlus, Pencil, FileText, FolderTree as FolderTreeIcon,
} from 'lucide-react';
import { useNotesStore } from '../../store/useNotesStore';
import { useFoldersStore } from '../../store/useFoldersStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTabsStore } from '../../store/useTabsStore';
import { useUIStore } from '../../store/useUIStore';
import {
  Segmented, EmptyState, Button, StickyNote, NoteListRow, ContextMenu, IconButton,
  ConfirmDialog, Menu,
} from '../../components';
import type { ContextMenuState, MenuItem } from '../../components';
import type { Folder, Note, SortKey } from '../../types';
import { noteName } from '../../utils/markdown';
import { foldersRepo } from '../folders/repo';
import { exportAsMarkdown, saveTextToFile, slugify } from '../../utils/export';
import { fileStamp } from '../../utils/time';
import { startDrag, readDrag } from '../../utils/dnd';
import { SearchResults } from './SearchResults';
import { cn } from '../../utils/cn';
import styles from './Home.module.css';

const SORT_LABELS: Record<SortKey, string> = {
  modified: 'Last modified',
  created: 'Date created',
  title: 'Title',
};

export function Home() {
  const notes = useNotesStore((s) => s.notes);
  const createNote = useNotesStore((s) => s.create);
  const trash = useNotesStore((s) => s.trash);
  const moveNote = useNotesStore((s) => s.move);
  const folders = useFoldersStore((s) => s.folders);
  const createFolder = useFoldersStore((s) => s.create);
  const renameFolder = useFoldersStore((s) => s.rename);
  const removeFolder = useFoldersStore((s) => s.remove);
  const moveFolder = useFoldersStore((s) => s.move);
  const loadNotes = useNotesStore((s) => s.load);
  const openNote = useTabsStore((s) => s.openNote);
  const dirty = useTabsStore((s) => s.dirty);

  const layout = useSettingsStore((s) => s.settings.homeLayout);
  const sort = useSettingsStore((s) => s.settings.homeSort);
  const showFoldersPref = useSettingsStore((s) => s.settings.homeShowFolders);
  const defaultFolderId = useSettingsStore((s) => s.settings.defaultFolderId);
  const update = useSettingsStore((s) => s.update);

  const scope = useUIStore((s) => s.scope);
  const goHome = useUIStore((s) => s.goHome);
  const setPendingNoteSearch = useUIStore((s) => s.setPendingNoteSearch);
  const searchTerm = useUIStore((s) => s.searchTerm).trim();

  // Open a note from global search, carrying the query into its in-note find.
  const openFromSearch = (id: string) => {
    setPendingNoteSearch(searchTerm);
    void openNote(id);
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Folder management (Explorer-style).
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderDraftName, setFolderDraftName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ folder: Folder; count: number } | null>(null);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const folderName = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const showFolders = !searchTerm && (scope.type === 'folder' || (scope.type === 'all' && showFoldersPref));

  // Folders to show as cards: a folder's children, or root folders on the homepage.
  const subfolders = useMemo(() => {
    if (scope.type === 'folder') return folders.filter((f) => f.parentId === scope.id);
    if (scope.type === 'all') return folders.filter((f) => f.parentId === null);
    return [];
  }, [folders, scope]);
  const noteCountOf = (folderId: string) => notes.filter((n) => n.folderId === folderId).length;

  // Breadcrumb path: All Notes › … › current folder.
  const crumbs = useMemo(() => {
    if (scope.type !== 'folder') return [];
    const chain: Folder[] = [];
    let cur = folderById.get(scope.id);
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? folderById.get(cur.parentId) : undefined;
    }
    return chain;
  }, [scope, folderById]);

  const title = searchTerm
    ? `Results for “${searchTerm}”`
    : scope.type === 'all'
      ? 'All Notes'
      : scope.type === 'pinned'
        ? 'Pinned'
        : folderName.get(scope.id) ?? 'Folder';

  const visible = useMemo(() => {
    let list: Note[];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = notes.filter(
        (n) => noteName(n).toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
      );
    } else if (scope.type === 'pinned') {
      list = notes.filter((n) => n.pinned);
    } else if (scope.type === 'folder') {
      list = notes.filter((n) => n.folderId === scope.id);
    } else {
      list = notes.slice();
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort.key === 'title') return noteName(a).localeCompare(noteName(b)) * dir;
      const col = sort.key === 'created' ? 'createdAt' : 'updatedAt';
      return (a[col] - b[col]) * dir;
    });
    return list;
  }, [notes, scope, searchTerm, sort]);

  const order = useMemo(() => visible.map((n) => n.id), [visible]);

  // Reset selection when the browsing context changes.
  useEffect(() => {
    setSelected(new Set());
    setAnchor(null);
  }, [scope, searchTerm]);

  const clearSel = () => { setSelected(new Set()); setAnchor(null); };

  const onItemClick = (e: MouseEvent, id: string, index: number) => {
    if (e.shiftKey && anchor != null) {
      const [a, b] = [anchor, index].sort((x, y) => x - y);
      setSelected(new Set(order.slice(a, b + 1)));
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      next.has(id) ? next.delete(id) : next.add(id);
      setSelected(next);
      setAnchor(index);
    } else {
      clearSel();
      void openNote(id);
    }
  };

  const onToggleSelect = (id: string, index: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
    setAnchor(index);
  };

  // --- bulk actions ---
  const noteById = (id: string) => notes.find((n) => n.id === id);

  const doOpen = (ids: string[]) => { ids.forEach((id) => void openNote(id)); clearSel(); };
  const doCopy = async (ids: string[]) => {
    const text = ids.map((id) => noteById(id)?.content ?? '').join('\n\n---\n\n');
    await navigator.clipboard.writeText(text);
    clearSel();
  };
  const doExport = async (ids: string[]) => {
    if (ids.length === 1) {
      const n = noteById(ids[0]);
      if (n) await exportAsMarkdown(noteName(n), n.content);
    } else {
      const body = ids
        .map((id) => { const n = noteById(id); return n ? `# ${noteName(n)}\n\n${n.content}` : ''; })
        .join('\n\n---\n\n');
      await saveTextToFile(body, {
        defaultName: `${slugify(title, 'notes')}-${fileStamp()}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
    }
    clearSel();
  };
  const doTrash = async (ids: string[]) => { for (const id of ids) await trash(id); clearSel(); };

  const buildItems = (ids: string[]): MenuItem[] => {
    const many = ids.length > 1;
    return [
      { label: many ? `Open ${ids.length} notes` : 'Open', icon: <SquareArrowOutUpRight size={15} />, onClick: () => doOpen(ids) },
      { label: 'Copy text', icon: <Copy size={15} />, onClick: () => void doCopy(ids) },
      { label: many ? `Export ${ids.length} (.md)` : 'Export', icon: <Download size={15} />, onClick: () => void doExport(ids) },
      { label: many ? `Move ${ids.length} to Trash` : 'Move to Trash', icon: <Trash2 size={15} />, tone: 'danger', separated: true, onClick: () => void doTrash(ids) },
    ];
  };

  const onContext = (e: MouseEvent, id: string, index: number) => {
    e.preventDefault();
    // Right-click targets this item without entering multi-select mode.
    const ids = selected.has(id) ? [...selected] : [id];
    if (!selected.has(id)) { setSelected(new Set([id])); setAnchor(index); }
    setMenu({ x: e.clientX, y: e.clientY, items: buildItems(ids) });
  };

  // --- folder actions ---
  const beginRenameFolder = (f: Folder) => { setEditingFolderId(f.id); setFolderDraftName(f.name); };
  const commitRenameFolder = () => {
    if (editingFolderId) void renameFolder(editingFolderId, folderDraftName);
    setEditingFolderId(null);
  };
  const onFolderContext = (e: MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open', icon: <SquareArrowOutUpRight size={15} />, onClick: () => goHome({ type: 'folder', id: folder.id }) },
        { label: 'New subfolder', icon: <FolderPlus size={15} />, onClick: () => void createFolder('Untitled folder', folder.id) },
        { label: 'Rename', icon: <Pencil size={15} />, onClick: () => beginRenameFolder(folder) },
        {
          label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger', separated: true,
          disabled: folder.id === defaultFolderId,
          onClick: async () => setPendingDelete({ folder, count: await foldersRepo.noteCount(folder.id) }),
        },
      ],
    });
  };
  const confirmDeleteFolder = async () => {
    if (!pendingDelete) return;
    await removeFolder(pendingDelete.folder.id);
    await loadNotes();
    setPendingDelete(null);
  };

  // --- drag and drop: drop a note or folder onto a folder to move it ---
  const onDropOnFolder = async (e: DragEvent, folderId: string) => {
    e.preventDefault();
    setDropTarget(null);
    const p = readDrag(e);
    if (!p || p.id === folderId) return;
    if (p.kind === 'note') await moveNote(p.id, folderId);
    else await moveFolder(p.id, folderId);
  };

  const onNew = async () => {
    const folderId = scope.type === 'folder' ? scope.id : undefined;
    const note = await createNote({ folderId });
    await openNote(note.id);
  };

  const onNewFolder = () =>
    void createFolder('Untitled folder', scope.type === 'folder' ? scope.id : null);

  const selectedIds = [...selected];
  const multi = selected.size > 1;

  const sortItems: MenuItem[] = (Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({
    label: SORT_LABELS[k],
    icon: sort.key === k ? <Check size={15} /> : <span style={{ width: 15, display: 'inline-block' }} />,
    onClick: () => update('homeSort', { ...sort, key: k }),
  }));

  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <div className={styles.heading}>
          {crumbs.length > 0 && !searchTerm && (
            <nav className={styles.breadcrumb} aria-label="Folder path">
              <button className={styles.crumb} onClick={() => goHome({ type: 'all' })}>All Notes</button>
              {crumbs.map((f, i) => (
                <span key={f.id} className={styles.crumbGroup}>
                  <ChevronRight size={13} className={styles.crumbSep} />
                  {i === crumbs.length - 1 ? (
                    <span className={styles.crumbCurrent}>{f.name}</span>
                  ) : (
                    <button className={styles.crumb} onClick={() => goHome({ type: 'folder', id: f.id })}>{f.name}</button>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.controls}>
          {selected.size > 0 && (
            <div className={styles.selControl}>
              <span className={styles.selCount}>{selected.size} selected</span>
              <IconButton label="Move to Trash" size="sm" onClick={() => void doTrash(selectedIds)}>
                <Trash2 size={16} />
              </IconButton>
              <IconButton label="Clear selection" size="sm" onClick={clearSel}>
                <X size={16} />
              </IconButton>
            </div>
          )}
          {!searchTerm && (
            <>
              {scope.type === 'all' && (
                <Segmented
                  size="sm"
                  value={showFoldersPref ? 'folders' : 'notes'}
                  onChange={(v) => update('homeShowFolders', v === 'folders')}
                  options={[
                    { value: 'notes', icon: <FileText size={15} />, title: 'Notes only' },
                    { value: 'folders', icon: <FolderTreeIcon size={15} />, title: 'Notes & folders' },
                  ]}
                />
              )}
              <Menu
                trigger={
                  <button className={styles.sortBtn} aria-label="Sort by">
                    {SORT_LABELS[sort.key]}
                    <ChevronDown size={14} />
                  </button>
                }
                items={sortItems}
              />
              <Segmented
                size="sm"
                value={sort.dir}
                onChange={(dir) => update('homeSort', { ...sort, dir })}
                options={[
                  { value: 'desc', icon: <ArrowDownNarrowWide size={15} />, title: 'Descending' },
                  { value: 'asc', icon: <ArrowUpNarrowWide size={15} />, title: 'Ascending' },
                ]}
              />
              <Segmented
                size="sm"
                value={layout}
                onChange={(l) => update('homeLayout', l)}
                options={[
                  { value: 'sticky', icon: <LayoutGrid size={15} />, title: 'Grid' },
                  { value: 'list', icon: <List size={15} />, title: 'List' },
                ]}
              />
            </>
          )}
        </div>
      </header>

      <div className={styles.scroll}>
        {showFolders && (
          <section className={styles.folderSection}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Folders</span>
              <IconButton label="New folder" size="sm" onClick={onNewFolder}>
                <FolderPlus size={15} />
              </IconButton>
            </div>
            {subfolders.length === 0 ? (
              <p className={styles.emptyFolders}>No folders</p>
            ) : (
              <div className={styles.folderGrid}>
                {subfolders.map((f) => (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    draggable={editingFolderId !== f.id}
                    className={cn(styles.folderCard, dropTarget === f.id && styles.folderCardDrop)}
                    onClick={() => editingFolderId !== f.id && goHome({ type: 'folder', id: f.id })}
                    onContextMenu={(e) => onFolderContext(e, f)}
                    onDragStart={(e) => startDrag(e, { kind: 'folder', id: f.id })}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(f.id); }}
                    onDragLeave={() => setDropTarget((d) => (d === f.id ? null : d))}
                    onDrop={(e) => void onDropOnFolder(e, f.id)}
                  >
                    <FolderIcon size={18} className={styles.folderCardIcon} />
                    {editingFolderId === f.id ? (
                      <input
                        className={styles.folderRenameInput}
                        value={folderDraftName}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setFolderDraftName(e.target.value)}
                        onBlur={commitRenameFolder}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRenameFolder();
                          if (e.key === 'Escape') setEditingFolderId(null);
                        }}
                      />
                    ) : (
                      <span className={styles.folderCardName}>{f.name}</span>
                    )}
                    <span className={styles.folderCardCount}>{noteCountOf(f.id)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {showFolders && (visible.length > 0 || subfolders.length > 0) && (
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>Notes</span>
          </div>
        )}

        {visible.length === 0 ? (
          showFolders ? (
            subfolders.length === 0 ? (
              <EmptyState
                icon={<NotebookPen size={40} />}
                title="Nothing here yet"
                description="Create a note or a folder to get started."
                action={<Button variant="primary" onClick={onNew}>New note</Button>}
              />
            ) : (
              <p className={styles.emptyFolders}>No notes here yet.</p>
            )
          ) : searchTerm ? (
            <EmptyState icon={<SearchX size={40} />} title="No matching notes" description={`Nothing matches “${searchTerm}”.`} />
          ) : (
            <EmptyState
              icon={<NotebookPen size={40} />}
              title="No notes here yet"
              description="Create a note and just start typing. It autosaves as a draft."
              action={<Button variant="primary" onClick={onNew}>New note</Button>}
            />
          )
        ) : searchTerm ? (
          <SearchResults results={visible} query={searchTerm} folderName={folderName} onOpen={openFromSearch} />
        ) : layout === 'sticky' ? (
          <div className={styles.grid}>
            {visible.map((note, i) => (
              <StickyNote
                key={note.id}
                note={note}
                folderName={note.folderId ? folderName.get(note.folderId) : undefined}
                dirty={dirty.has(note.id)}
                selected={selected.has(note.id)}
                selecting={multi}
                onClick={(e) => onItemClick(e, note.id, i)}
                onContextMenu={(e) => onContext(e, note.id, i)}
                onToggleSelect={() => onToggleSelect(note.id, i)}
                onDragStart={(e) => startDrag(e, { kind: 'note', id: note.id })}
              />
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            <div className={styles.listHead}>
              <span />
              <span>Title</span>
              <span>Folder</span>
              <span>Created</span>
              <span>Modified</span>
            </div>
            {visible.map((note, i) => (
              <NoteListRow
                key={note.id}
                note={note}
                folderName={note.folderId ? folderName.get(note.folderId) : undefined}
                dirty={dirty.has(note.id)}
                selected={selected.has(note.id)}
                selecting={selected.size > 0}
                onClick={(e) => onItemClick(e, note.id, i)}
                onContextMenu={(e) => onContext(e, note.id, i)}
                onToggleSelect={() => onToggleSelect(note.id, i)}
                onDragStart={(e) => startDrag(e, { kind: 'note', id: note.id })}
              />
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
