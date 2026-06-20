import { useMemo, useState } from 'react';
import {
  ChevronRight, Folder as FolderIcon, FolderPlus, Pencil, Trash2, MoreHorizontal,
  FileText, Copy, SquareArrowOutUpRight,
} from 'lucide-react';
import type { DragEvent } from 'react';
import type { Folder, Note } from '../../types';
import { useFoldersStore } from '../../store/useFoldersStore';
import { useNotesStore } from '../../store/useNotesStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTabsStore } from '../../store/useTabsStore';
import { useUIStore } from '../../store/useUIStore';
import { ContextMenu } from '../../components';
import type { ContextMenuState } from '../../components';
import { noteName } from '../../utils/markdown';
import { startDrag, readDrag } from '../../utils/dnd';
import { cn } from '../../utils/cn';
import styles from './FolderTree.module.css';

interface FolderTreeProps {
  onRequestDelete: (folder: Folder) => void;
}

export function FolderTree({ onRequestDelete }: FolderTreeProps) {
  const folders = useFoldersStore((s) => s.folders);
  const createFolder = useFoldersStore((s) => s.create);
  const renameFolder = useFoldersStore((s) => s.rename);
  const moveFolder = useFoldersStore((s) => s.move);
  const notes = useNotesStore((s) => s.notes);
  const trashNote = useNotesStore((s) => s.trash);
  const moveNote = useNotesStore((s) => s.move);
  const setFileName = useNotesStore((s) => s.setFileName);
  const openNote = useTabsStore((s) => s.openNote);
  const activeNoteId = useTabsStore((s) => s.activeNoteId());
  const defaultFolderId = useSettingsStore((s) => s.settings.defaultFolderId);

  const expanded = useUIStore((s) => s.expandedFolders);
  const toggleExpanded = useUIStore((s) => s.toggleFolderExpanded);
  const scope = useUIStore((s) => s.scope);
  const goHome = useUIStore((s) => s.goHome);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  const byParent = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const arr = map.get(f.parentId) ?? [];
      arr.push(f);
      map.set(f.parentId, arr);
    }
    return map;
  }, [folders]);

  // Notes grouped by their folder, for the nested file rows (Explorer-style).
  const notesByFolder = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      if (!n.folderId) continue;
      const arr = map.get(n.folderId) ?? [];
      arr.push(n);
      map.set(n.folderId, arr);
    }
    return map;
  }, [notes]);

  const beginRename = (f: Folder) => { setEditingId(f.id); setDraftName(f.name); };
  const commitRename = () => {
    if (editingId) void renameFolder(editingId, draftName);
    setEditingId(null);
  };

  const beginRenameNote = (n: Note) => { setEditingNoteId(n.id); setNoteDraft(noteName(n)); };
  const commitRenameNote = () => {
    if (editingNoteId) void setFileName(editingNoteId, noteDraft);
    setEditingNoteId(null);
  };

  const openMenu = (e: React.MouseEvent, folder: Folder, isOpen: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'New subfolder',
          icon: <FolderPlus size={15} />,
          onClick: async () => {
            await createFolder('Untitled folder', folder.id);
            if (!isOpen) toggleExpanded(folder.id);
          },
        },
        { label: 'Rename', icon: <Pencil size={15} />, onClick: () => beginRename(folder) },
        {
          label: 'Delete',
          icon: <Trash2 size={15} />,
          tone: 'danger',
          separated: true,
          disabled: folder.id === defaultFolderId,
          onClick: () => onRequestDelete(folder),
        },
      ],
    });
  };

  const openFileMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open', icon: <SquareArrowOutUpRight size={15} />, onClick: () => void openNote(note.id) },
        { label: 'Rename', icon: <Pencil size={15} />, onClick: () => beginRenameNote(note) },
        { label: 'Copy text', icon: <Copy size={15} />, onClick: () => void navigator.clipboard.writeText(note.content) },
        { label: 'Move to Trash', icon: <Trash2 size={15} />, tone: 'danger', separated: true, onClick: () => void trashNote(note.id) },
      ],
    });
  };

  const onDropOnFolder = async (e: DragEvent, folderId: string) => {
    e.preventDefault();
    setDropId(null);
    const p = readDrag(e);
    if (!p || p.id === folderId) return;
    if (p.kind === 'note') await moveNote(p.id, folderId);
    else await moveFolder(p.id, folderId);
  };

  const renderLevel = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId);
    if (!children) return null;
    return children.map((folder) => {
      const folderNotes = notesByFolder.get(folder.id) ?? [];
      const hasChildren = byParent.has(folder.id) || folderNotes.length > 0;
      const isOpen = expanded.has(folder.id);
      const selected = scope.type === 'folder' && scope.id === folder.id;
      // When collapsed, hint that the open note lives in this folder.
      const hasActive = !isOpen && !!activeNoteId && folderNotes.some((n) => n.id === activeNoteId);

      return (
        <div key={folder.id}>
          <div
            className={cn(
              styles.row,
              selected && styles.selected,
              dropId === folder.id && styles.dropTarget,
              hasActive && styles.hasActive,
            )}
            style={{ paddingLeft: `calc(var(--space-2) + ${depth * 14}px)` }}
            draggable={editingId !== folder.id}
            onContextMenu={(e) => openMenu(e, folder, isOpen)}
            onDragStart={(e) => startDrag(e, { kind: 'folder', id: folder.id })}
            onDragOver={(e) => { e.preventDefault(); setDropId(folder.id); }}
            onDragLeave={() => setDropId((d) => (d === folder.id ? null : d))}
            onDrop={(e) => void onDropOnFolder(e, folder.id)}
          >
            <button
              className={cn(styles.chevron, !hasChildren && styles.chevronHidden)}
              onClick={() => hasChildren && toggleExpanded(folder.id)}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
              tabIndex={hasChildren ? 0 : -1}
            >
              <ChevronRight size={14} className={cn(isOpen && styles.chevronOpen)} />
            </button>

            <button
              className={styles.main}
              onClick={() => {
                // Select the folder and toggle its expansion on each click
                // (so a second click on a selected folder collapses it).
                goHome({ type: 'folder', id: folder.id });
                if (hasChildren) toggleExpanded(folder.id);
              }}
              onDoubleClick={() => beginRename(folder)}
            >
              <FolderIcon size={15} className={styles.folderIcon} />
              {editingId === folder.id ? (
                <input
                  className={styles.renameInput}
                  value={draftName}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <span className={styles.name}>{folder.name}</span>
              )}
            </button>

            <button
              className={styles.menuBtn}
              aria-label="Folder actions"
              onClick={(e) => openMenu(e, folder, isOpen)}
            >
              <MoreHorizontal size={15} />
            </button>
          </div>

          {isOpen && renderLevel(folder.id, depth + 1)}
          {isOpen && folderNotes.map((note) => (
            <div
              key={note.id}
              className={cn(styles.fileRow, note.id === activeNoteId && styles.fileActive)}
              style={{ paddingLeft: `calc(var(--space-2) + ${(depth + 1) * 14 + 20}px)` }}
              draggable={editingNoteId !== note.id}
              onClick={() => editingNoteId !== note.id && openNote(note.id)}
              onContextMenu={(e) => openFileMenu(e, note)}
              onDragStart={(e) => startDrag(e, { kind: 'note', id: note.id })}
              title={noteName(note)}
            >
              <FileText size={14} className={styles.fileIcon} />
              {editingNoteId === note.id ? (
                <input
                  className={styles.renameInput}
                  value={noteDraft}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={commitRenameNote}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRenameNote();
                    if (e.key === 'Escape') setEditingNoteId(null);
                  }}
                />
              ) : (
                <span className={styles.fileName}>{noteName(note)}</span>
              )}
            </div>
          ))}
        </div>
      );
    });
  };

  return (
    <div className={styles.tree}>
      {renderLevel(null, 0)}
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
