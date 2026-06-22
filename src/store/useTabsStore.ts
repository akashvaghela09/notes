import { create } from 'zustand';
import type { Tab } from '../types';
import { tabsRepo } from '../features/tabs/repo';
import { draftsRepo } from '../features/drafts/repo';
import { notesRepo } from '../features/notes/repo';
import { useUIStore } from './useUIStore';
import { useNotesStore } from './useNotesStore';

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  /** noteIds with uncommitted draft changes → drives the tab dirty dot. */
  dirty: Set<string>;
  /** Live first-line titles for open notes (updates as the user types). */
  liveTitles: Record<string, string>;

  load: () => Promise<void>;
  openNote: (noteId: string) => Promise<void>;
  activate: (tabId: string) => void;
  /** Remove a tab from state + DB. Caller handles any dirty confirmation. */
  closeTab: (tabId: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  setDirty: (noteId: string, dirty: boolean) => void;
  setLiveTitle: (noteId: string, title: string) => void;
  activeNoteId: () => string | null;
  tabForNote: (noteId: string) => Tab | undefined;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  dirty: new Set(),
  liveTitles: {},

  async load() {
    const allTabs = await tabsRepo.list();
    const dirty = new Set(await draftsRepo.dirtyNoteIds());
    // Keep only tabs whose note still has unsaved work (a draft). Saved,
    // draft-less notes are dropped so relaunching starts with a clean tab list.
    const tabs = allTabs.filter((t) => dirty.has(t.noteId));
    const removed = allTabs.filter((t) => !dirty.has(t.noteId));
    if (removed.length) {
      for (const t of removed) await tabsRepo.close(t.id);
      await tabsRepo.reorder(tabs.map((t) => t.id));
    }
    const active = tabs.find((t) => t.isActive) ?? null;
    set({ tabs, dirty, activeTabId: active?.id ?? null });
  },

  async openNote(noteId) {
    const existing = get().tabs.find((t) => t.noteId === noteId);
    if (existing) {
      get().activate(existing.id);
      return;
    }
    const tab = await tabsRepo.open(noteId, get().tabs.length);
    await tabsRepo.setActive(tab.id);
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id });
    useUIStore.getState().goEditor();
  },

  activate(tabId) {
    void tabsRepo.setActive(tabId);
    set({ activeTabId: tabId });
    useUIStore.getState().goEditor();
  },

  async closeTab(tabId) {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const closedNoteId = tabs[idx].noteId;
    const remaining = tabs.filter((t) => t.id !== tabId);
    await tabsRepo.close(tabId);
    await tabsRepo.reorder(remaining.map((t) => t.id));

    // Discard blank, untouched notes so closing an unused tab leaves no clutter.
    if (await notesRepo.isEmpty(closedNoteId)) {
      await notesRepo.deleteForever(closedNoteId);
      useNotesStore.setState((s) => ({ notes: s.notes.filter((n) => n.id !== closedNoteId) }));
    }

    let nextActive = activeTabId;
    if (activeTabId === tabId) {
      const neighbor = remaining[idx] ?? remaining[idx - 1] ?? null;
      nextActive = neighbor?.id ?? null;
      if (neighbor) {
        await tabsRepo.setActive(neighbor.id);
        useUIStore.getState().goEditor();
      } else {
        await tabsRepo.clearActive();
        useUIStore.getState().goHome();
      }
    }
    set({ tabs: remaining, activeTabId: nextActive });
  },

  async reorder(orderedIds) {
    await tabsRepo.reorder(orderedIds);
    const byId = new Map(get().tabs.map((t) => [t.id, t]));
    set({
      tabs: orderedIds.map((id, i) => ({ ...byId.get(id)!, position: i })),
    });
  },

  setDirty(noteId, dirty) {
    const next = new Set(get().dirty);
    dirty ? next.add(noteId) : next.delete(noteId);
    set({ dirty: next });
  },

  setLiveTitle(noteId, title) {
    set({ liveTitles: { ...get().liveTitles, [noteId]: title } });
  },

  activeNoteId() {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId)?.noteId ?? null;
  },

  tabForNote(noteId) {
    return get().tabs.find((t) => t.noteId === noteId);
  },
}));
