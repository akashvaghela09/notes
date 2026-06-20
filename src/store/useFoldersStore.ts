import { create } from 'zustand';
import type { Folder } from '../types';
import { foldersRepo } from '../features/folders/repo';
import { notesRepo } from '../features/notes/repo';
import { useSettingsStore } from './useSettingsStore';
import { useNotesStore } from './useNotesStore';

interface FoldersState {
  folders: Folder[];
  load: () => Promise<void>;
  create: (name: string, parentId?: string | null) => Promise<Folder>;
  rename: (id: string, name: string) => Promise<void>;
  /** Reparent a folder (drag-and-drop). No-op if it would create a cycle. */
  move: (id: string, parentId: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** True if `candidate` is `folderId` or sits anywhere beneath it. */
function isSelfOrDescendant(folders: Folder[], candidate: string, folderId: string): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur: Folder | undefined = byId.get(candidate);
  while (cur) {
    if (cur.id === folderId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

export const useFoldersStore = create<FoldersState>((set, get) => ({
  folders: [],

  async load() {
    set({ folders: await foldersRepo.list() });
  },

  async create(name, parentId = null) {
    const folder = await foldersRepo.create(name, parentId);
    set({ folders: await foldersRepo.list() });
    return folder;
  },

  async rename(id, name) {
    await foldersRepo.rename(id, name);
    set({ folders: await foldersRepo.list() });
  },

  async move(id, parentId) {
    if (id === parentId) return;
    // Don't allow dropping a folder into itself or one of its own descendants.
    if (parentId && isSelfOrDescendant(get().folders, parentId, id)) return;
    await foldersRepo.setParent(id, parentId);
    set({ folders: await foldersRepo.list() });
  },

  async remove(id) {
    await foldersRepo.delete(id);
    // Notes in the (sub)folder(s) had folder_id set NULL by FK — re-home them.
    const defaultId = useSettingsStore.getState().settings.defaultFolderId;
    if (defaultId) await notesRepo.reassignOrphansTo(defaultId);
    set({ folders: await foldersRepo.list() });
    await useNotesStore.getState().load();
  },
}));
