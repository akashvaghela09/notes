import { useEffect, useMemo, useRef } from 'react';
import { TabBar } from './app/TabBar';
import { Sidebar } from './app/Sidebar';
import { Workspace } from './app/Workspace';
import { SettingsModal } from './features/settings/SettingsModal';
import { useSettingsStore } from './store/useSettingsStore';
import { useNotesStore } from './store/useNotesStore';
import { useTabsStore } from './store/useTabsStore';
import { useUIStore } from './store/useUIStore';
import { useBootStore } from './store/useBootStore';
import { useSttStore, initStt } from './store/useSttStore';
import { loadAll, startFreshNote } from './store/bootstrap';
import { useTheme } from './hooks/useTheme';
import { useHotkeys } from './hooks/useHotkeys';
import { clampFontPx } from './lib/constants';
import { mark } from './utils/perf';
import { ListeningIndicator } from './components';
import styles from './App.module.css';

export default function App() {
  const setHydrated = useBootStore((s) => s.setHydrated);
  const booted = useRef(false);

  const theme = useSettingsStore((s) => s.settings.theme);
  const fontPx = useSettingsStore((s) => s.settings.editorFontPx);
  const sidebarCollapsed = useSettingsStore((s) => s.settings.sidebarCollapsed);
  const update = useSettingsStore((s) => s.update);
  const createNote = useNotesStore((s) => s.create);
  const openNote = useTabsStore((s) => s.openNote);
  const openSettings = useUIStore((s) => s.openSettings);

  useTheme(theme);

  // Suppress the webview's native right-click menu (Back/Forward/Reload). Our
  // own context menus call preventDefault in their handlers and still work.
  useEffect(() => {
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, []);

  // Render the shell immediately and connect SQLite in the background, so the
  // writing surface is usable right away (DESIGN.md: no landing page, feel
  // instant). The BootEditor covers the workspace until the note is ready.
  useEffect(() => {
    if (booted.current) return; // StrictMode double-invoke / re-render guard
    booted.current = true;
    // Wire speech-to-text event listeners once (cheap — no native init).
    initStt();
    mark('boot:loadAll-start');
    void loadAll()
      .then(() => mark('boot:data-loaded'))
      .then(() => {
        // Only touch the speech backend when the feature is enabled, so a user
        // who never turns it on pays nothing (no model scan, no GPU/Vulkan init).
        if (useSettingsStore.getState().settings.sttEnabled) {
          void useSttStore.getState().loadCapabilities();
          void useSttStore.getState().loadModels();
        }
      })
      .then(startFreshNote)
      .then(() => {
        mark('boot:note-ready');
        setHydrated(true);
      })
      .finally(() => {
        // Warm the markdown chunk once we're idle so preview/print are ready
        // without paying the cost on the cold path.
        const warm = () => void import('./components/Markdown/MarkdownView');
        const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
        if (w.requestIdleCallback) w.requestIdleCallback(warm);
        else window.setTimeout(warm, 1500);
      });
  }, [setHydrated]);

  const bumpFont = (delta: number) =>
    update('editorFontPx', clampFontPx(useSettingsStore.getState().settings.editorFontPx + delta));

  const hotkeys = useMemo(
    () => [
      {
        key: 'n',
        handler: async (e: KeyboardEvent) => {
          e.preventDefault();
          const note = await createNote();
          await openNote(note.id);
        },
      },
      {
        // Global search (across notes) — Ctrl/Cmd+Shift+F.
        key: 'f',
        shift: true,
        handler: (e: KeyboardEvent) => {
          e.preventDefault();
          if (sidebarCollapsed) void update('sidebarCollapsed', false);
          requestAnimationFrame(() => document.getElementById('sidebar-search')?.focus());
        },
      },
      { key: ',', handler: (e: KeyboardEvent) => { e.preventDefault(); openSettings(); } },
      // Dictation: Ctrl/Cmd+Space toggles in the current note (or a new one);
      // Ctrl/Cmd+Shift+Space always starts in a fresh note. Both no-op silently
      // when the feature is off or no model is installed (handled in the store).
      { key: ' ', handler: (e: KeyboardEvent) => { e.preventDefault(); void useSttStore.getState().toggleSession({ newNote: false }); } },
      { key: ' ', shift: true, handler: (e: KeyboardEvent) => { e.preventDefault(); void useSttStore.getState().startSession({ newNote: true }); } },
      { key: '\\', handler: (e: KeyboardEvent) => { e.preventDefault(); void update('sidebarCollapsed', !sidebarCollapsed); } },
      // Continuous editor font sizing: Ctrl/Cmd+Shift+Plus / Minus
      { key: '+', shift: true, handler: (e: KeyboardEvent) => { e.preventDefault(); void bumpFont(1); } },
      { key: '=', shift: true, handler: (e: KeyboardEvent) => { e.preventDefault(); void bumpFont(1); } },
      { key: '_', shift: true, handler: (e: KeyboardEvent) => { e.preventDefault(); void bumpFont(-1); } },
      { key: '-', shift: true, handler: (e: KeyboardEvent) => { e.preventDefault(); void bumpFont(-1); } },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createNote, openNote, openSettings, sidebarCollapsed, update, fontPx],
  );
  useHotkeys(hotkeys);

  return (
    <>
      <TabBar />
      <div className={styles.body}>
        {!sidebarCollapsed && <Sidebar />}
        <Workspace />
      </div>
      <SettingsModal />
      <ListeningIndicator />
    </>
  );
}
