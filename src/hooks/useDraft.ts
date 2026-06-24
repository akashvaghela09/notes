import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../types';
import { draftsRepo } from '../features/drafts/repo';
import { useNotesStore } from '../store/useNotesStore';
import { useTabsStore } from '../store/useTabsStore';
import { debounce } from '../utils/debounce';
import { deriveTitle } from '../utils/markdown';
import { DRAFT_AUTOSAVE_MS } from '../lib/constants';

export type SaveState = 'clean' | 'saving' | 'dirty' | 'saved';

export interface DraftController {
  content: string;
  setContent: (c: string) => void;
  saveState: SaveState;
  dirty: boolean;
  /** Commit working copy → saved note, then clear the draft + undo history.
   *  Pass `latest` to commit a value newer than the (possibly debounced) state. */
  commit: (latest?: string) => Promise<void>;
  /** Throw away the draft and revert to the last saved version. */
  discard: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Bumps when content changes PROGRAMMATICALLY (undo/redo/discard/seed), so
   *  the uncontrolled textarea can be synced imperatively. User typing never
   *  bumps it — the DOM already has the value. */
  syncToken: number;
}

/** Rapid keystrokes within this window collapse into a single undo step. */
const HISTORY_COALESCE_MS = 600;

/** Per-note undo/redo history, kept for the whole session (survives tab
 *  switches and saves) — only an app restart clears it. */
const historyCache = new Map<string, { past: string[]; future: string[] }>();
function historyFor(noteId: string) {
  let h = historyCache.get(noteId);
  if (!h) { h = { past: [], future: [] }; historyCache.set(noteId, h); }
  return h;
}

/**
 * The draft/save model (DESIGN.md §7), simplified to a single content surface.
 * Working edits autosave to the `drafts` table (crash-safe); an explicit commit
 * (Ctrl+S) writes the saved note. Undo/redo tracks edits until the next commit.
 */
export function useDraft(note: Note, seedContent?: string): DraftController {
  const [content, setContentState] = useState(note.content);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [histVer, setHistVer] = useState(0);
  const [syncToken, setSyncToken] = useState(0);
  const bumpSync = () => setSyncToken((t) => t + 1);

  const setDirtyTab = useTabsStore((s) => s.setDirty);
  const setLiveTitle = useTabsStore((s) => s.setLiveTitle);
  const commitNote = useNotesStore((s) => s.commit);

  const base = useRef(note.content);
  base.current = note.content;

  // Track last-pushed tab title / dirty flag so we only write to the tabs store
  // when they actually change — avoids re-rendering the TabBar + Home on every
  // keystroke (the main remaining source of typing lag).
  const lastTitle = useRef(deriveTitle('', note.content));
  const lastDirty = useRef(false);

  // Latest content, readable inside stable callbacks (which don't close over it).
  const contentRef = useRef(content);
  contentRef.current = content;

  // Undo/redo stacks (the same arrays held in the session cache, so history
  // survives remounts/saves). Mutate in place — never reassign these refs.
  const cache = historyFor(note.id);
  const past = useRef(cache.past);
  const future = useRef(cache.future);
  const lastSnap = useRef(0);
  const bumpHist = () => setHistVer((v) => v + 1);

  const isDirty = (c: string) => c !== base.current;

  const autosave = useMemo(
    () =>
      debounce((c: string) => {
        void draftsRepo.save(note.id, deriveTitle('', c), c).then(() => {
          setSaveState((s) => (s === 'saving' ? 'dirty' : s));
        });
      }, DRAFT_AUTOSAVE_MS),
    [note.id],
  );

  // Apply a content value (no history snapshot) — shared by typing + undo/redo.
  const applyContent = useCallback(
    (c: string) => {
      setContentState(c);
      // Only touch the tabs store when the derived title actually changes.
      const title = deriveTitle('', c);
      if (title !== lastTitle.current) {
        lastTitle.current = title;
        setLiveTitle(note.id, title);
      }
      const dirty = isDirty(c);
      if (dirty) {
        setSaveState('saving');
        autosave(c);
      } else {
        autosave.cancel();
        void draftsRepo.clear(note.id);
        setSaveState('clean');
      }
      // …and only when the dirty flag flips.
      if (dirty !== lastDirty.current) {
        lastDirty.current = dirty;
        setDirtyTab(note.id, dirty);
      }
    },
    [autosave, note.id, setDirtyTab], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Adopt a surviving draft on open, or seed buffered boot keystrokes.
  useEffect(() => {
    let cancelled = false;
    void draftsRepo.get(note.id).then((d) => {
      if (cancelled) return;
      const seed = d?.content ?? (seedContent && seedContent !== base.current ? seedContent : undefined);
      if (seed === undefined) return;
      setContentState(seed);
      bumpSync(); // push the loaded draft / boot text into the uncontrolled textarea
      const title = deriveTitle('', seed);
      lastTitle.current = title;
      setLiveTitle(note.id, title);
      const dirty = isDirty(seed);
      lastDirty.current = dirty;
      setSaveState(dirty ? 'dirty' : 'clean');
      setDirtyTab(note.id, dirty);
      if (!d && seedContent) void draftsRepo.save(note.id, deriveTitle('', seed), seed);
    });
    return () => {
      cancelled = true;
      autosave.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const setContent = useCallback(
    (c: string) => {
      const t = Date.now();
      // Snapshot the value being left for undo, coalescing rapid edits.
      if (past.current.length === 0 || t - lastSnap.current > HISTORY_COALESCE_MS) {
        past.current.push(contentRef.current);
        if (past.current.length > 300) past.current.shift();
        future.current.length = 0; // mutate in place to keep the cache link
        bumpHist();
      }
      lastSnap.current = t;
      applyContent(c);
    },
    [applyContent],
  );

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const prev = past.current.pop()!;
    future.current.push(contentRef.current);
    lastSnap.current = 0;
    applyContent(prev);
    bumpHist();
    bumpSync();
  }, [applyContent]);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current.pop()!;
    past.current.push(contentRef.current);
    lastSnap.current = 0;
    applyContent(next);
    bumpHist();
    bumpSync();
  }, [applyContent]);

  const commit = useCallback(async (latest?: string) => {
    autosave.cancel();
    const c = latest ?? contentRef.current;
    contentRef.current = c;
    await commitNote(note.id, deriveTitle('', c), c);
    await draftsRepo.clear(note.id);
    setDirtyTab(note.id, false);
    setSaveState('saved');
    // Undo history is intentionally kept after save (session-long).
    window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'clean' : s)), 1200);
  }, [autosave, commitNote, note.id, setDirtyTab]);

  const discard = useCallback(async () => {
    autosave.cancel();
    await draftsRepo.clear(note.id);
    setContentState(base.current);
    bumpSync();
    lastDirty.current = false;
    setDirtyTab(note.id, false);
    setSaveState('clean');
  }, [autosave, note.id, setDirtyTab]);

  return {
    content,
    setContent,
    saveState,
    dirty: saveState === 'dirty' || saveState === 'saving',
    commit,
    discard,
    undo,
    redo,
    // histVer in deps keeps these fresh after each history mutation.
    canUndo: histVer >= 0 && past.current.length > 0,
    canRedo: histVer >= 0 && future.current.length > 0,
    syncToken,
  };
}
