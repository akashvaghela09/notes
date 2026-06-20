import { create } from 'zustand';
import type { Note, NoteColor } from '../types';
import { notesRepo } from '../features/notes/repo';
import { useSettingsStore } from './useSettingsStore';

interface NotesState {
  /** Cache of all live (non-trashed) notes; views filter/sort this client-side. */
  notes: Note[];
  trashed: Note[];
  load: () => Promise<void>;
  loadTrash: () => Promise<void>;
  create: (init?: Partial<Pick<Note, 'title' | 'fileName' | 'content' | 'folderId' | 'color'>>) => Promise<Note>;
  commit: (id: string, title: string, content: string) => Promise<void>;
  setColor: (id: string, color: NoteColor) => Promise<void>;
  setFileName: (id: string, fileName: string) => Promise<void>;
  setPinned: (id: string, pinned: boolean) => Promise<void>;
  move: (id: string, folderId: string | null) => Promise<void>;
  trash: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  deleteForever: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  getById: (id: string) => Note | undefined;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  trashed: [],

  async load() {
    // Cache unsorted; views apply the user's sort preference themselves.
    set({ notes: await notesRepo.list({ key: 'modified', dir: 'desc' }) });
  },

  async loadTrash() {
    set({ trashed: await notesRepo.listTrashed() });
  },

  async create(init) {
    // Every note belongs to a folder: fall back to the default if none given.
    const folderId =
      init?.folderId ?? useSettingsStore.getState().settings.defaultFolderId ?? null;
    const note = await notesRepo.create({ ...init, folderId });
    set({ notes: [note, ...get().notes] });
    return note;
  },

  async commit(id, title, content) {
    await notesRepo.commit(id, title, content);
    const ts = Date.now();
    set({
      notes: get().notes.map((n) => (n.id === id ? { ...n, title, content, updatedAt: ts } : n)),
    });
  },

  async setColor(id, color) {
    await notesRepo.setColor(id, color);
    set({ notes: get().notes.map((n) => (n.id === id ? { ...n, color } : n)) });
  },

  async setFileName(id, fileName) {
    const name = fileName.trim();
    await notesRepo.setFileName(id, name);
    const ts = Date.now();
    set({
      notes: get().notes.map((n) => (n.id === id ? { ...n, fileName: name, updatedAt: ts } : n)),
    });
  },

  async setPinned(id, pinned) {
    await notesRepo.setPinned(id, pinned);
    set({ notes: get().notes.map((n) => (n.id === id ? { ...n, pinned } : n)) });
  },

  async move(id, folderId) {
    await notesRepo.move(id, folderId);
    set({ notes: get().notes.map((n) => (n.id === id ? { ...n, folderId } : n)) });
  },

  async trash(id) {
    await notesRepo.trash(id);
    await Promise.all([get().load(), get().loadTrash()]);
  },

  async restore(id) {
    await notesRepo.restore(id);
    await Promise.all([get().load(), get().loadTrash()]);
  },

  async deleteForever(id) {
    await notesRepo.deleteForever(id);
    set({
      notes: get().notes.filter((n) => n.id !== id),
      trashed: get().trashed.filter((n) => n.id !== id),
    });
  },

  async emptyTrash() {
    await notesRepo.emptyTrash();
    set({ trashed: [] });
  },

  getById(id) {
    return get().notes.find((n) => n.id === id) ?? get().trashed.find((n) => n.id === id);
  },
}));
