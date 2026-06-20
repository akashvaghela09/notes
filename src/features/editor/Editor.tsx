import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Pin, Palette, Download, Eye, Pencil, FolderInput, FileText, FileType, Printer,
  Save, AlignCenter, AlignJustify, Plus, FileUp, CopyPlus, Clipboard, Search,
  Undo2, Redo2, PanelLeft, PanelLeftClose, ArrowUp, ArrowDown, X, Settings,
} from 'lucide-react';
import type { Note } from '../../types';
import { useNotesStore } from '../../store/useNotesStore';
import { useFoldersStore } from '../../store/useFoldersStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTabsStore } from '../../store/useTabsStore';
import { useUIStore } from '../../store/useUIStore';
import { useBootStore } from '../../store/useBootStore';
import { useDraft } from '../../hooks/useDraft';
import { useHotkeys } from '../../hooks/useHotkeys';
import { exportAsText, exportAsMarkdown, importTextFile } from '../../utils/export';
import { wordCount, noteName } from '../../utils/markdown';
import { fullDate } from '../../utils/time';
import {
  IconButton, Menu, SaveStatePill, ColorPicker, MarkdownView,
} from '../../components';
import type { MenuItem } from '../../components';
import { PrintLayer } from './PrintLayer';
import { cn } from '../../utils/cn';
import styles from './Editor.module.css';

/** Build the highlight backdrop: matches wrapped in <mark>, current one darker. */
function highlightNodes(text: string, matches: number[], len: number, activeStart: number): ReactNode[] {
  if (!matches.length) return [text];
  const nodes: ReactNode[] = [];
  let last = 0;
  matches.forEach((start, i) => {
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <mark key={i} className={start === activeStart ? styles.markActive : styles.mark}>
        {text.slice(start, start + len)}
      </mark>,
    );
    last = start + len;
  });
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
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

  const [preview, setPreview] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // --- in-note search ---
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
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

  // Scroll the active match into view (the .surface scrolls, not the textarea).
  useEffect(() => {
    if (!searchOpen) return;
    backdropRef.current?.querySelector(`.${styles.markActive}`)?.scrollIntoView({ block: 'center' });
  }, [matchIdx, searchOpen, query, content]);

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

  const gotoMatch = (idx: number) => {
    if (!matches.length) return;
    // Just move the highlighted match; the scroll-into-view effect reveals it.
    // (Selecting in the textarea would paint the OS selection over the mark.)
    setMatchIdx(((idx % matches.length) + matches.length) % matches.length);
  };
  const openSearch = () => { setPreview(false); setSearchOpen(true); };

  // Carry a query handed over from global search into this note's find bar.
  useEffect(() => {
    if (!pendingNoteSearch) return;
    setPreview(false);
    setQuery(pendingNoteSearch);
    setSearchOpen(true);
    setPendingNoteSearch('');
  }, [pendingNoteSearch, setPendingNoteSearch]);

  // Boot hand-off: consume the buffered keystrokes once (the value + caret are
  // applied by the sync effect below when the draft/seed loads).
  useEffect(() => {
    if (seedContent) clearBootContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The textarea is UNCONTROLLED (native typing — no per-keystroke React round
  // trip, so the cursor never lags). The invisible sizer (which drives the
  // auto-height) is updated imperatively, never via React, so a keystroke does
  // no full-text React reconciliation. Push the value into both on programmatic
  // changes (syncToken) AND whenever the textarea remounts (e.g. returning from
  // markdown preview) — otherwise the sizer stays empty and scrolling breaks.
  useEffect(() => {
    if (preview) return; // textarea/sizer aren't mounted in preview
    if (sizerRef.current) sizerRef.current.textContent = content + '\n';
    const el = bodyRef.current;
    if (el && el.value !== content) {
      el.value = content;
      const end = content.length;
      el.setSelectionRange(end, end);
      el.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.syncToken, preview]);

  const onType = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.currentTarget.value;
    if (sizerRef.current) sizerRef.current.textContent = v + '\n'; // instant height, no React
    setContent(v);
  };

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
    { key: 's', handler: (e) => { e.preventDefault(); void commit(); } },
    { key: 'z', handler: (e) => { e.preventDefault(); draft.undo(); } },
    { key: 'z', shift: true, handler: (e) => { e.preventDefault(); draft.redo(); } },
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
    { label: 'Plain text (.txt)', icon: <FileText size={15} />, onClick: () => void exportAsText(displayName, content) },
    { label: 'Markdown (.md)', icon: <FileType size={15} />, onClick: () => void exportAsMarkdown(displayName, content) },
    { label: 'PDF (print)', icon: <Printer size={15} />, separated: true, onClick: printPdf },
  ];

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
    const copy = await createNote({ content, folderId: note.folderId, color: note.color });
    await openNote(copy.id);
  };
  const onCopy = () => void navigator.clipboard.writeText(content);

  const fontFamily =
    settings.editorTypeface === 'serif' ? 'var(--font-serif)'
    : settings.editorTypeface === 'mono' ? 'var(--font-mono)'
    : 'var(--font-ui)';

  return (
    <div
      className={styles.editor}
      style={{ '--editor-font-size': `${settings.editorFontPx}px`, '--editor-font': fontFamily } as React.CSSProperties}
    >
      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          <IconButton label="New note" onClick={onNewNote}><Plus size={17} /></IconButton>
          <IconButton label="Import file" onClick={onImport}><FileUp size={17} /></IconButton>
          <Menu trigger={<IconButton label="Export"><Download size={17} /></IconButton>} items={exportItems} align="left" />
          <IconButton label="Duplicate" onClick={onDuplicate}><CopyPlus size={17} /></IconButton>
          <IconButton label="Copy to clipboard" onClick={onCopy}><Clipboard size={17} /></IconButton>
          <IconButton label="Save" onClick={() => void commit()} disabled={!draft.dirty}><Save size={17} /></IconButton>

          <span className={styles.divider} />

          <IconButton label="Find in note" active={searchOpen} onClick={openSearch}><Search size={17} /></IconButton>
          <IconButton label="Undo" onClick={draft.undo} disabled={!draft.canUndo}><Undo2 size={17} /></IconButton>
          <IconButton label="Redo" onClick={draft.redo} disabled={!draft.canRedo}><Redo2 size={17} /></IconButton>

          <span className={styles.divider} />

          {markdownOn && (
            <IconButton label={preview ? 'Edit' : 'Preview'} active={preview} onClick={() => setPreview((p) => !p)}>
              {preview ? <Pencil size={17} /> : <Eye size={17} />}
            </IconButton>
          )}
          <IconButton
            label={focusMode ? 'Focus mode on' : 'Focus mode off'}
            active={focusMode}
            onClick={() => void updateSetting('focusMode', !focusMode)}
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

          <span className={styles.divider} />

          <IconButton label="Settings" onClick={openSettings}><Settings size={17} /></IconButton>
        </div>

        <SaveStatePill state={draft.saveState} />
      </div>

      {searchOpen && (
        <div className={styles.searchBar}>
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
      )}

      <div className={styles.surface}>
        <div className={cn(styles.column, !focusMode && styles.wide)}>
          {preview && markdownOn ? (
            <MarkdownView content={content} className={styles.preview} />
          ) : (
            <div className={styles.editArea}>
              {/* Invisible replica sizes the grid cell to the content (updated
                  imperatively in onType / the sync effect — never via React),
                  so the full-width .surface stays the only scroller. */}
              <div className={styles.sizer} aria-hidden ref={sizerRef} />
              {searchOpen && query && (
                <div className={styles.backdrop} aria-hidden ref={backdropRef}>
                  {highlightNodes(content, matches, query.length, matches[matchIdx] ?? -1)}
                  {'\n'}
                </div>
              )}
              <textarea
                ref={bodyRef}
                className={cn(styles.body, searchOpen && query && styles.bodyTransparent)}
                placeholder="Start typing…"
                defaultValue={note.content}
                onChange={onType}
                spellCheck={settings.spellcheck}
                autoFocus
              />
            </div>
          )}
        </div>
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
