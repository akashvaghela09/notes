import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pin, Palette, Download, Eye, Pencil, FolderInput, FileText, FileType, Printer,
  Save, AlignCenter, AlignJustify, Plus, FileUp, CopyPlus, Clipboard, Search,
  Undo2, Redo2, PanelLeft, PanelLeftClose, ArrowUp, ArrowDown, X, Settings,
  Mic, MicOff, ChevronDown, Check, Replace, ReplaceAll,
} from 'lucide-react';
import type { Note } from '../../types';
import { useNotesStore } from '../../store/useNotesStore';
import { useFoldersStore } from '../../store/useFoldersStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTabsStore } from '../../store/useTabsStore';
import { useUIStore } from '../../store/useUIStore';
import { useBootStore } from '../../store/useBootStore';
import { useSttStore, isSttActive } from '../../store/useSttStore';
import { useDraft } from '../../hooks/useDraft';
import { useHotkeys } from '../../hooks/useHotkeys';
import { exportAsText, exportAsMarkdown, importTextFile } from '../../utils/export';
import { wordCount, noteName } from '../../utils/markdown';
import { fullDate } from '../../utils/time';
import { debounce } from '../../utils/debounce';
import {
  IconButton, Menu, SaveStatePill, ColorPicker, MarkdownView, Button,
} from '../../components';
import type { MenuItem } from '../../components';
import { PrintLayer } from './PrintLayer';
import { CmEditor, External } from './CmEditor';
import type { CmHandle } from './CmEditor';
import styles from './Editor.module.css';

// ---- Voice commands -------------------------------------------------------
// Spoken commands recognized only when a *whole* finalized utterance equals the
// phrase (the user deliberately pauses to say it). The same words spoken inside
// a sentence are just dictated as text.
type VoiceCommand = 'newline' | 'paragraph' | 'clearSentence';

const VOICE_COMMANDS: Record<string, VoiceCommand> = {
  'new line': 'newline',
  'newline': 'newline',
  'next line': 'newline',
  'new paragraph': 'paragraph',
  'next paragraph': 'paragraph',
  'delete': 'clearSentence',
};

/** Match a finalized transcript to a command, or null. Whole-segment only. */
function matchVoiceCommand(text: string): VoiceCommand | null {
  const norm = text.toLowerCase().trim().replace(/[.,!?;:'"]+$/g, '').replace(/\s+/g, ' ').trim();
  return VOICE_COMMANDS[norm] ?? null;
}

/** Index in `text` where the last sentence begins (after the prior terminator). */
function lastSentenceStart(text: string): number {
  const t = text.replace(/\s+$/, '');
  if (!t) return 0;
  const core = t.replace(/[.!?]+$/, ''); // ignore the terminator closing this sentence
  let idx = -1;
  for (let i = core.length - 1; i >= 0; i--) {
    const c = core[i];
    if (c === '.' || c === '!' || c === '?' || c === '\n') { idx = i; break; }
  }
  let start = idx + 1;
  while (start < t.length && /\s/.test(t[start])) start++;
  return start;
}

/** Apply a voice command to a (before-caret, after-caret) split. */
function applyCommandToText(before: string, after: string, cmd: VoiceCommand): { next: string; caret: number } {
  if (cmd === 'newline') {
    const b = before.replace(/[ \t]+$/, '');
    return { next: `${b}\n${after}`, caret: b.length + 1 };
  }
  if (cmd === 'paragraph') {
    const b = before.replace(/\s+$/, '');
    return { next: `${b}\n\n${after}`, caret: b.length + 2 };
  }
  // clearSentence
  const b = before.slice(0, lastSentenceStart(before)).replace(/[ \t]+$/, '');
  return { next: b + after, caret: b.length };
}

export function Editor({ note, seedContent }: { note: Note; seedContent?: string }) {
  const draft = useDraft(note, seedContent);
  const { content, setContent, commit } = draft;
  const displayName = noteName(note);

  const setPinned = useNotesStore((s) => s.setPinned);
  const setColor = useNotesStore((s) => s.setColor);
  const move = useNotesStore((s) => s.move);
  const createNote = useNotesStore((s) => s.create);
  const folders = useFoldersStore((s) => s.folders);
  const openNote = useTabsStore((s) => s.openNote);
  const openSettings = useUIStore((s) => s.openSettings);
  const pendingNoteSearch = useUIStore((s) => s.pendingNoteSearch);
  const setPendingNoteSearch = useUIStore((s) => s.setPendingNoteSearch);

  const settings = useSettingsStore((s) => s.settings);
  const updateSetting = useSettingsStore((s) => s.update);
  const markdownOn = settings.markdownEnabled;
  const focusMode = settings.focusMode;
  const sidebarCollapsed = settings.sidebarCollapsed;

  const clearBootContent = useBootStore((s) => s.clearBootContent);

  // Speech-to-text: the toolbar mic shows only when the feature is on AND a
  // model is installed. The session status drives the active/toggle state.
  const sttEnabled = settings.sttEnabled;
  const sttModels = useSttStore((s) => s.models);
  const sttActive = useSttStore((s) => isSttActive(s.session.status));
  const registerSink = useSttStore((s) => s.registerSink);
  const clearSink = useSttStore((s) => s.clearSink);
  // Downloaded models drive the toolbar dropdown; the active one is the chosen
  // model (or the first installed if the chosen one isn't downloaded).
  const downloadedModels = sttModels.filter((m) => m.downloaded);
  const activeModel = downloadedModels.find((m) => m.id === settings.sttModel) ?? downloadedModels[0];
  const showMic = sttEnabled && downloadedModels.length > 0;

  const [preview, setPreview] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const cmRef = useRef<CmHandle>(null);

  // CodeMirror is the source of truth; user edits sync to the draft on a short
  // debounce so steady typing does no per-keystroke React work. The debounced
  // `content` only drives non-critical display (word count, find, save pill);
  // every authoritative read (save/export/copy) pulls the live value from CM,
  // and we flush before commit/undo/dictation and on unmount so nothing is lost.
  const pushContent = useMemo(() => debounce(setContent, 80), [setContent]);
  useEffect(() => () => pushContent.flush(), [pushContent]);
  const liveContent = useCallback(() => cmRef.current?.getValue() ?? content, [content]);
  const saveNote = useCallback(() => { pushContent.flush(); void commit(cmRef.current?.getValue()); }, [pushContent, commit]);

  // Soft-wrap long lines (default). Always wrap in Focus mode (a narrow centered
  // column gains nothing from horizontal scroll). Line numbers are a full-width
  // feature only (the gutter wants the left edge, which fights focus centering).
  // CodeMirror renders both natively (virtualized), so they cost no per-keystroke
  // work regardless of note length.
  const wrap = settings.editorWrap || focusMode;
  const lineNumbers = settings.editorLineNumbers && !focusMode;

  const fontFamily =
    settings.editorTypeface === 'serif' ? 'var(--font-serif)'
    : settings.editorTypeface === 'mono' ? 'var(--font-mono)'
    : 'var(--font-ui)';

  // --- in-note search / replace ---
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const matches = useMemo(() => {
    if (!query) return [] as number[];
    const res: number[] = [];
    const hay = content.toLowerCase();
    const q = query.toLowerCase();
    let i = hay.indexOf(q);
    while (i !== -1) { res.push(i); i = hay.indexOf(q, i + Math.max(1, q.length)); }
    return res;
  }, [query, content]);

  useEffect(() => { setMatchIdx(0); }, [query]);

  const gotoMatch = (idx: number) => {
    if (!matches.length) return;
    setMatchIdx(((idx % matches.length) + matches.length) % matches.length);
  };
  const openSearch = () => { setPreview(false); setSearchOpen(true); };

  // Ctrl/Cmd + ↑ / ↓ jumps between matches from anywhere (even while editing).
  useEffect(() => {
    if (!searchOpen || !matches.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); gotoMatch(matchIdx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); gotoMatch(matchIdx - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, matchIdx, matches]);

  // Programmatic full-document replace (find/replace). Pushes the new text into
  // CodeMirror without echoing back as a user edit, then records one undo step.
  const applyEdit = (next: string, caret: number) => {
    const view = cmRef.current?.view;
    if (view && !preview) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: caret },
        annotations: External.of(true),
        scrollIntoView: true,
      });
    }
    setContent(next);
  };

  const replaceCurrent = () => {
    if (!matches.length || !query) return;
    const start = matches[matchIdx] ?? matches[0];
    const next = content.slice(0, start) + replaceTerm + content.slice(start + query.length);
    applyEdit(next, start + replaceTerm.length);
  };

  const replaceAll = () => {
    if (!matches.length || !query) return;
    let res = '';
    let last = 0;
    for (const start of matches) {
      res += content.slice(last, start) + replaceTerm;
      last = start + query.length;
    }
    res += content.slice(last);
    applyEdit(res, res.length);
  };

  // Carry a query handed over from global search into this note's find bar.
  useEffect(() => {
    if (!pendingNoteSearch) return;
    setPreview(false);
    setQuery(pendingNoteSearch);
    setSearchOpen(true);
    setPendingNoteSearch('');
  }, [pendingNoteSearch, setPendingNoteSearch]);

  // Boot hand-off: consume the buffered keystrokes once (CmEditor seeds itself
  // from `content` on mount; the draft loads any surviving draft below).
  useEffect(() => {
    if (seedContent) clearBootContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push content into the editor when it changes PROGRAMMATICALLY (undo/redo/
  // discard/draft-load → syncToken). User typing never bumps syncToken; CM
  // already holds those edits, and setValue no-ops when the text already matches.
  useEffect(() => {
    if (preview) return;
    cmRef.current?.setValue(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.syncToken, preview]);

  // Escape closes the in-note find bar from anywhere (even while editing).
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // Dictation inserts text into the editor live. While an utterance is in
  // progress its interim text occupies a tracked region [start, start+len] in the
  // CM document that gets replaced as Whisper refines it (like IME composition).
  // Interim edits dispatch with the External annotation so they don't flood the
  // draft's undo/autosave; only the final result is committed via setContent.
  const partialStart = useRef<number | null>(null);
  const partialLen = useRef(0);
  const typeTarget = useRef('');
  const typeFinal = useRef(false);
  const shownText = useRef('');
  const rafId = useRef<number | null>(null);

  const resetRegion = useCallback(() => {
    partialStart.current = null;
    partialLen.current = 0;
    shownText.current = '';
    typeTarget.current = '';
    typeFinal.current = false;
  }, []);

  // Replace the current interim region's visible text with `visible`, keeping the
  // caret at its end. Returns the new full document text, or null when there's no
  // open region / live editor.
  const paintRegion = useCallback((visible: string): string | null => {
    const view = cmRef.current?.view;
    if (!view || partialStart.current === null) return null;
    const docLen = view.state.doc.length;
    const from = Math.min(partialStart.current, docLen);
    const to = Math.min(from + partialLen.current, docLen);
    view.dispatch({
      changes: { from, to, insert: visible },
      selection: { anchor: from + visible.length },
      annotations: External.of(true),
      scrollIntoView: true,
    });
    if (!view.hasFocus) view.focus(); // keep the caret visible during dictation
    partialLen.current = visible.length;
    shownText.current = visible;
    return view.state.doc.toString();
  }, []);

  const stopReveal = useCallback(() => {
    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
  }, []);

  // One animation frame: move the visible region toward typeTarget. Whisper
  // revises interim guesses ("I think" → "I thought"), so when the new target
  // diverges from what's shown we first BACKSPACE (delete) down to the longest
  // common prefix, then type forward again — a visible correction rather than an
  // in-place character swap. Pure appends skip straight to typing forward. Steps
  // scale with the distance so it never lags behind speech. Kept in a ref for
  // fresh state.
  const stepRef = useRef<() => void>(() => {});
  stepRef.current = () => {
    rafId.current = null;
    if (partialStart.current === null) return;
    const target = typeTarget.current;
    const shown = shownText.current;
    if (shown === target) {
      if (typeFinal.current) {
        const done = paintRegion(target);
        resetRegion();
        if (done !== null) setContent(done); // one undo step per utterance; triggers autosave
      }
      return;
    }
    let cp = 0;
    const max = Math.min(shown.length, target.length);
    while (cp < max && shown[cp] === target[cp]) cp++;
    let visible: string;
    if (shown.length > cp) {
      const step = Math.max(1, Math.ceil((shown.length - cp) / 4));
      visible = shown.slice(0, Math.max(cp, shown.length - step));
    } else {
      const step = Math.max(1, Math.ceil((target.length - shown.length) / 8));
      visible = target.slice(0, shown.length + step);
    }
    paintRegion(visible);
    rafId.current = requestAnimationFrame(() => stepRef.current());
  };

  const kickReveal = useCallback(() => {
    if (rafId.current === null) rafId.current = requestAnimationFrame(() => stepRef.current());
  }, []);

  const applyTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      pushContent.flush(); // commit any pending typing before dictation edits the doc
      const piece = text.trim();
      const view = cmRef.current?.view;

      // Whole-segment voice command (e.g. a deliberately-paused "new line").
      // Revert any interim text from THIS utterance, then run the action.
      if (isFinal) {
        const cmd = matchVoiceCommand(piece);
        if (cmd) {
          stopReveal();
          if (view && !preview) {
            if (partialStart.current !== null) {
              const docLen = view.state.doc.length;
              const s = Math.min(partialStart.current, docLen);
              const e = Math.min(s + partialLen.current, docLen);
              view.dispatch({ changes: { from: s, to: e, insert: '' }, selection: { anchor: s }, annotations: External.of(true) });
            }
            resetRegion();
            const doc = view.state.doc.toString();
            const caret = view.state.selection.main.head;
            const { next, caret: nc } = applyCommandToText(doc.slice(0, caret), doc.slice(caret), cmd);
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: next },
              selection: { anchor: nc },
              annotations: External.of(true),
              scrollIntoView: true,
            });
            if (!view.hasFocus) view.focus();
            setContent(next);
          } else {
            resetRegion();
            const { next } = applyCommandToText(content, '', cmd);
            setContent(next);
          }
          return;
        }
      }

      // No live editor (markdown preview): drop interim state; append finals.
      if (!view || preview) {
        stopReveal();
        resetRegion();
        if (isFinal && piece) {
          const sep = content && !/\s$/.test(content) ? ' ' : '';
          setContent(content + sep + piece);
        }
        return;
      }

      // A new utterance arriving while the previous final is still revealing:
      // flush the old one to its end and commit before opening a fresh region.
      if (typeFinal.current && partialStart.current !== null) {
        stopReveal();
        const done = paintRegion(typeTarget.current);
        resetRegion();
        if (done !== null) setContent(done);
      }

      // Nothing to show yet and no open region — wait for real words.
      if (!piece && partialStart.current === null) return;

      // Open a fresh region at the caret, inserting a separator if needed.
      if (partialStart.current === null) {
        const head = view.state.selection.main.head;
        const before = view.state.doc.sliceString(0, head);
        const sep = before && !/\s$/.test(before) ? ' ' : '';
        if (sep) {
          view.dispatch({ changes: { from: head, insert: sep }, selection: { anchor: head + sep.length }, annotations: External.of(true) });
        }
        partialStart.current = head + sep.length;
        partialLen.current = 0;
      }

      // Aim the region at the latest recognition; the reveal loop streams toward
      // it and a final commits from inside the loop once fully shown.
      typeTarget.current = piece;
      typeFinal.current = isFinal;
      kickReveal();
    },
    [content, preview, setContent, paintRegion, resetRegion, stopReveal, kickReveal, pushContent],
  );

  // Route transcripts to whichever editor is active. A ref keeps the registered
  // sink stable across re-renders while always calling the latest handler.
  const sinkRef = useRef(applyTranscript);
  sinkRef.current = applyTranscript;
  useEffect(() => {
    const sink = (text: string, isFinal: boolean) => sinkRef.current(text, isFinal);
    registerSink(sink);
    return () => clearSink(sink);
  }, [note.id, registerSink, clearSink]);

  // Safety net: if a session ends with interim text still uncommitted (error or
  // abrupt stop with no final), flush the region to its full target so words
  // still mid-reveal aren't lost, commit it, and clear the region.
  useEffect(() => {
    if (sttActive || partialStart.current === null) return;
    stopReveal();
    const done = typeTarget.current ? paintRegion(typeTarget.current) : null;
    resetRegion();
    const finalVal = done ?? cmRef.current?.getValue() ?? null;
    if (finalVal !== null) setContent(finalVal);
  }, [sttActive, setContent, stopReveal, paintRegion, resetRegion]);

  // Cancel any in-flight reveal frame when the editor unmounts.
  useEffect(() => () => stopReveal(), [stopReveal]);

  // Word count is O(n); recompute it a beat after typing stops, not per keystroke.
  const [words, setWords] = useState(() => wordCount(note.content));
  useEffect(() => {
    const t = window.setTimeout(() => setWords(wordCount(content)), 400);
    return () => clearTimeout(t);
  }, [content]);

  // Mount the print layer only while printing. Otherwise the hidden markdown
  // render would re-parse the whole note on EVERY keystroke (major typing lag).
  const [printing, setPrinting] = useState(false);
  const printPdf = async () => {
    // Print the markdown render only when the markdown view is actually on;
    // otherwise print the plain text exactly as edited.
    pushContent.flush(); // ensure PrintLayer sees the latest content
    if (preview) await import('../../components/Markdown/MarkdownView');
    setPrinting(true);
  };
  useEffect(() => {
    if (!printing) return;
    const prev = document.title;
    document.title = displayName;
    // Restore + unmount only AFTER printing finishes — never before, or the
    // print layer would be gone before the engine captures it (blank output).
    const done = () => { document.title = prev; setPrinting(false); };
    window.addEventListener('afterprint', done, { once: true });
    // Wait two frames so the print layer (incl. markdown) is committed + painted.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    // Fallback in case afterprint never fires in this webview.
    const fallback = window.setTimeout(done, 60000);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('afterprint', done);
      window.clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printing]);

  useHotkeys([
    { key: 's', handler: (e) => { e.preventDefault(); saveNote(); } },
    { key: 'z', handler: (e) => { e.preventDefault(); pushContent.flush(); draft.undo(); } },
    { key: 'z', shift: true, handler: (e) => { e.preventDefault(); pushContent.flush(); draft.redo(); } },
    { key: 'f', handler: (e) => { e.preventDefault(); openSearch(); } },
    { key: 'm', handler: (e) => { e.preventDefault(); if (markdownOn) setPreview((p) => !p); } },
  ]);

  useEffect(() => {
    if (!colorOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [colorOpen]);

  const moveItems: MenuItem[] = folders.map((f) => ({
    label: f.name,
    icon: <FolderInput size={15} />,
    onClick: () => void move(note.id, f.id),
  }));

  const exportItems: MenuItem[] = [
    { label: 'Plain text (.txt)', icon: <FileText size={15} />, onClick: () => void exportAsText(displayName, liveContent()) },
    { label: 'Markdown (.md)', icon: <FileType size={15} />, onClick: () => void exportAsMarkdown(displayName, liveContent()) },
    { label: 'PDF (print)', icon: <Printer size={15} />, separated: true, onClick: printPdf },
  ];

  // Dictation model picker — only downloaded models, current one checked.
  const sttModelItems: MenuItem[] = downloadedModels.map((m) => ({
    label: m.label,
    icon: activeModel?.id === m.id ? <Check size={15} /> : undefined,
    onClick: () => void useSttStore.getState().setModel(m.id),
  }));

  const onNewNote = async () => {
    const n = await createNote({ folderId: note.folderId });
    await openNote(n.id);
  };
  const onImport = async () => {
    const file = await importTextFile();
    if (!file) return;
    const n = await createNote({ content: file.content, fileName: file.name, folderId: note.folderId });
    await openNote(n.id);
  };
  const onDuplicate = async () => {
    const copy = await createNote({ content: liveContent(), folderId: note.folderId, color: note.color });
    await openNote(copy.id);
  };
  const onCopy = () => void navigator.clipboard.writeText(liveContent());

  return (
    <div
      className={styles.editor}
      style={{ '--editor-font-size': `${settings.editorFontPx}px`, '--editor-font': fontFamily, '--editor-font-weight': String(settings.editorFontWeight) } as React.CSSProperties}
    >
      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          <IconButton label="New note" onClick={onNewNote}><Plus size={17} /></IconButton>
          <IconButton label="Import file" onClick={onImport}><FileUp size={17} /></IconButton>
          <Menu trigger={<IconButton label="Export"><Download size={17} /></IconButton>} items={exportItems} align="left" />
          <IconButton label="Duplicate" onClick={onDuplicate}><CopyPlus size={17} /></IconButton>
          <IconButton label="Copy to clipboard" onClick={onCopy}><Clipboard size={17} /></IconButton>
          <IconButton label="Save" onClick={saveNote} disabled={!draft.dirty}><Save size={17} /></IconButton>

          <span className={styles.divider} />

          <IconButton label="Find in note" active={searchOpen} onClick={openSearch}><Search size={17} /></IconButton>
          <IconButton label="Undo" onClick={() => { pushContent.flush(); draft.undo(); }} disabled={!draft.canUndo}><Undo2 size={17} /></IconButton>
          <IconButton label="Redo" onClick={() => { pushContent.flush(); draft.redo(); }} disabled={!draft.canRedo}><Redo2 size={17} /></IconButton>

          <span className={styles.divider} />

          {markdownOn && (
            <IconButton label={preview ? 'Edit' : 'Preview'} active={preview} onClick={() => setPreview((p) => !p)}>
              {preview ? <Pencil size={17} /> : <Eye size={17} />}
            </IconButton>
          )}
          <IconButton
            label={focusMode ? 'Focus mode on' : 'Focus mode off'}
            active={focusMode}
            // Don't let the button steal focus from the editor, then keep focus
            // in the note across the relayout.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void updateSetting('focusMode', !focusMode);
              requestAnimationFrame(() => cmRef.current?.focus());
            }}
          >
            {focusMode ? <AlignCenter size={17} /> : <AlignJustify size={17} />}
          </IconButton>
          <IconButton label={note.pinned ? 'Unpin' : 'Pin'} active={note.pinned} onClick={() => void setPinned(note.id, !note.pinned)}>
            <Pin size={17} fill={note.pinned ? 'currentColor' : 'none'} />
          </IconButton>
          <div className={styles.colorWrap} ref={colorRef}>
            <IconButton label="Note color" active={colorOpen} onClick={() => setColorOpen((o) => !o)}>
              <Palette size={17} />
            </IconButton>
            {colorOpen && (
              <div className={styles.colorPopover}>
                <ColorPicker value={note.color} onChange={(c) => { void setColor(note.id, c); setColorOpen(false); }} />
              </div>
            )}
          </div>
          {moveItems.length > 0 && (
            <Menu trigger={<IconButton label="Move to folder"><FolderInput size={17} /></IconButton>} items={moveItems} align="left" />
          )}

          {/* Dictation: model picker + mic toggle. Only when enabled and a model
              is installed. Sits as its own section just before Settings. */}
          {showMic && (
            <>
              <span className={styles.divider} />
              <Menu
                trigger={
                  <button className={styles.sttModel} title="Dictation model">
                    {activeModel?.id ?? 'model'}
                    <ChevronDown size={13} />
                  </button>
                }
                items={sttModelItems}
                align="left"
              />
              <IconButton
                label={sttActive ? 'Stop dictation' : 'Dictate (Ctrl+Space)'}
                active={sttActive}
                onClick={() => void useSttStore.getState().toggleSession({ newNote: false })}
              >
                {sttActive ? <Mic size={17} /> : <MicOff size={17} />}
              </IconButton>
            </>
          )}

          <span className={styles.divider} />

          <IconButton label="Settings" onClick={openSettings}><Settings size={17} /></IconButton>
        </div>

        <SaveStatePill state={draft.saveState} />
      </div>

      {searchOpen && (
        <div className={styles.searchBar}>
          <div className={styles.searchRow}>
            <IconButton
              label={replaceOpen ? 'Hide replace' : 'Show replace'}
              size="sm"
              active={replaceOpen}
              onClick={() => setReplaceOpen((o) => !o)}
            >
              <Replace size={15} />
            </IconButton>
            <Search size={14} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Find in note…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); gotoMatch(matchIdx + (e.shiftKey ? -1 : 1)); }
                if (e.key === 'Escape') setSearchOpen(false);
              }}
            />
            <span className={styles.searchCount}>
              {query ? (matches.length ? `${matchIdx + 1}/${matches.length}` : 'No results') : ''}
            </span>
            <IconButton label="Previous" size="sm" disabled={!matches.length} onClick={() => gotoMatch(matchIdx - 1)}><ArrowUp size={15} /></IconButton>
            <IconButton label="Next" size="sm" disabled={!matches.length} onClick={() => gotoMatch(matchIdx + 1)}><ArrowDown size={15} /></IconButton>
            <IconButton label="Close search" size="sm" onClick={() => setSearchOpen(false)}><X size={15} /></IconButton>
          </div>

          {replaceOpen && (
            <div className={styles.searchRow}>
              <span className={styles.replaceSpacer} aria-hidden />
              <ReplaceAll size={14} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Replace with…"
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
                  if (e.key === 'Escape') setSearchOpen(false);
                }}
              />
              <Button size="sm" variant="ghost" disabled={!matches.length} onClick={replaceCurrent}>Replace</Button>
              <Button size="sm" variant="ghost" disabled={!matches.length} onClick={replaceAll}>All</Button>
            </div>
          )}
        </div>
      )}

      <div className={styles.surface}>
        {preview && markdownOn ? (
          <MarkdownView content={content} className={styles.preview} />
        ) : (
          <CmEditor
            ref={cmRef}
            className={styles.cm}
            initialDoc={content}
            onChange={pushContent}
            lineNumbers={lineNumbers}
            wrap={wrap}
            spellcheck={settings.spellcheck}
            fontPx={settings.editorFontPx}
            fontWeight={settings.editorFontWeight}
            fontFamily={fontFamily}
            focusMode={focusMode}
            matches={searchOpen ? matches : []}
            matchLen={query.length}
            activeMatch={matchIdx}
          />
        )}
      </div>

      <div className={styles.statusbar}>
        <div className={styles.statusLeft}>
          <IconButton
            label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            size="sm"
            onClick={() => void updateSetting('sidebarCollapsed', !sidebarCollapsed)}
          >
            {sidebarCollapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
          </IconButton>
          <span className={styles.wordCount}>{words} words</span>
        </div>
        <span>Last saved {fullDate(note.updatedAt)}</span>
      </div>

      {printing && <PrintLayer content={content} markdown={preview} />}
    </div>
  );
}
