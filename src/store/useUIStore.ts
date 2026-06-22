import { create } from 'zustand';

export type View = 'home' | 'editor' | 'trash';

export type HomeScope =
  | { type: 'all' }
  | { type: 'pinned' }
  | { type: 'folder'; id: string };

interface UIState {
  view: View;
  scope: HomeScope;
  settingsOpen: boolean;
  /** Active substring search; empty string = not searching. */
  searchTerm: string;
  expandedFolders: Set<string>;
  /** Query handed from global search to the editor's in-note find on open. */
  pendingNoteSearch: string;
  /** A just-created folder id that should drop straight into inline rename. */
  pendingFolderRename: string | null;

  goHome: (scope?: HomeScope) => void;
  setPendingNoteSearch: (q: string) => void;
  setPendingFolderRename: (id: string | null) => void;
  goTrash: () => void;
  goEditor: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setSearchTerm: (term: string) => void;
  toggleFolderExpanded: (id: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  view: 'home',
  scope: { type: 'all' },
  settingsOpen: false,
  searchTerm: '',
  expandedFolders: new Set(),
  pendingNoteSearch: '',
  pendingFolderRename: null,

  setPendingNoteSearch(q) {
    set({ pendingNoteSearch: q });
  },

  setPendingFolderRename(id) {
    set({ pendingFolderRename: id });
  },

  goHome(scope) {
    set({ view: 'home', scope: scope ?? get().scope, searchTerm: '' });
  },
  goTrash() {
    set({ view: 'trash' });
  },
  goEditor() {
    set({ view: 'editor' });
  },
  openSettings() {
    set({ settingsOpen: true });
  },
  closeSettings() {
    set({ settingsOpen: false });
  },
  setSearchTerm(term) {
    // Typing a query implies we want to see results on the home surface.
    set({ searchTerm: term, view: term ? 'home' : get().view });
  },
  toggleFolderExpanded(id) {
    const next = new Set(get().expandedFolders);
    next.has(id) ? next.delete(id) : next.add(id);
    set({ expandedFolders: next });
  },
}));
