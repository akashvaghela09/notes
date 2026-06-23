import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
import {
  IconButton, Menu, SaveStatePill, ColorPicker, MarkdownView, Button,
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

/** Newline-joined line numbers "1\n2\n…" sized to a text's logical line count.
 *  Updated imperatively into the gutter so typing does no React reconciliation.
 *  Used by the no-wrap gutter, where every line is exactly one row tall. */
function lineNumberText(text: string): string {
  const count = text.length === 0 ? 1 : text.split('\n').length;
  let s = '';
  for (let i = 1; i <= count; i++) s += `${i}\n`;
  return s;
}

const removeTextNodes = (host: HTMLElement) => {
  for (const n of Array.from(host.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) host.removeChild(n);
  }
};

/** Render `text` as one block per logical line into `host` (reusing children),
 *  so each line's wrapped height can be measured. Empty lines get a zero-width
 *  space to keep a one-row box. Backs the measured wrap gutter. */
function renderLineBlocks(host: HTMLElement, text: string, cls: string): void {
  removeTextNodes(host);
  const lines = text.split('\n');
  while (host.children.length > lines.length) host.removeChild(host.lastElementChild!);
  while (host.children.length < lines.length) {
    const d = document.createElement('div');
    d.className = cls;
    host.appendChild(d);
  }
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i] === '' ? '\u200b' : lines[i];
    const d = host.children[i] as HTMLElement;
    if (d.textContent !== t) d.textContent = t;
  }
}

/** Size each gutter line block to its matching sizer line, so one number sits at
 *  each logical line's first row and wrapped rows stay blank. Each measured
 *  height is snapped to a whole number of `unit` (single-row) heights: this both
 *  keeps the numbers evenly spaced (no sub-pixel jitter) and keeps them aligned
 *  with the textarea, whose rows are each exactly one line tall. Numbers are
 *  written first (they can change the gutter width, hence the text wrap), then
 *  heights are read in one pass, then written — one forced layout regardless of
 *  line count. */
function syncGutterHeights(sizer: HTMLElement, gutter: HTMLElement, cls: string, unit: number): void {
  removeTextNodes(gutter);
  const count = sizer.children.length;
  while (gutter.children.length > count) gutter.removeChild(gutter.lastElementChild!);
  while (gutter.children.length < count) {
    const d = document.createElement('div');
    d.className = cls;
    gutter.appendChild(d);
  }
  for (let i = 0; i < count; i++) {
    const g = gutter.children[i] as HTMLElement;
    const num = `${i + 1}`;
    if (g.textContent !== num) g.textContent = num;
  }
  const heights = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const h = (sizer.children[i] as HTMLElement).getBoundingClientRect().height;
    const rows = unit > 0 ? Math.max(1, Math.round(h / unit)) : 1;
    heights[i] = unit > 0 ? rows * unit : h;
  }
  for (let i = 0; i < count; i++) {
    const hpx = `${heights[i]}px`;
    const g = gutter.children[i] as HTMLElement;
    if (g.style.height !== hpx) g.style.height = hpx;
  }
}

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
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const gutterRef = useRef<HTMLDivElement>(null);
  const editAreaRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const caretMirrorRef = useRef<HTMLDivElement | null>(null);

  // The textarea is overflow:hidden (it auto-grows; the .surface is the scroller),
  // so the browser's native "keep the caret visible" no longer fires. Mirror the
  // text up to the caret into a hidden clone, read the caret's position from it,
  // and scroll the .surface so the caret stays in view while typing/navigating.
  const scrollCaretIntoView = useCallback(() => {
    const el = bodyRef.current;
    const surface = surfaceRef.current;
    if (!el || !surface) return;
    let mirror = caretMirrorRef.current;
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.setAttribute('aria-hidden', 'true');
      document.body.appendChild(mirror);
      caretMirrorRef.current = mirror;
    }
    const cs = getComputedStyle(el);
    const s = mirror.style;
    s.position = 'absolute';
    s.visibility = 'hidden';
    s.top = '0';
    s.left = '-9999px';
    s.boxSizing = 'border-box';
    s.width = `${el.offsetWidth}px`;
    s.fontFamily = cs.fontFamily;
    s.fontSize = cs.fontSize;
    s.fontWeight = cs.fontWeight;
    s.lineHeight = cs.lineHeight;
    s.letterSpacing = cs.letterSpacing;
    s.padding = cs.padding;
    s.tabSize = cs.tabSize;
    s.whiteSpace = el.wrap === 'off' ? 'pre' : 'pre-wrap';
    s.overflowWrap = 'anywhere';
    const pos = el.selectionStart ?? el.value.length;
    mirror.textContent = el.value.slice(0, pos);
    const marker = document.createElement('span');
    marker.textContent = '.';
    mirror.appendChild(marker);

    const elRect = el.getBoundingClientRect();
    const surfRect = surface.getBoundingClientRect();
    const mRect = mirror.getBoundingClientRect();
    const markRect = marker.getBoundingClientRect();
    const caretTop = elRect.top + (markRect.top - mRect.top);
    const lineH = markRect.height || parseFloat(cs.lineHeight) || 18;
    const caretBottom = caretTop + lineH;

    const vMargin = lineH * 1.5;
    if (caretTop < surfRect.top + vMargin) {
      surface.scrollTop -= surfRect.top + vMargin - caretTop;
    } else if (caretBottom > surfRect.bottom - vMargin) {
      surface.scrollTop += caretBottom - (surfRect.bottom - vMargin);
    }

    // Horizontal only matters when lines don't wrap (the surface scrolls sideways).
    if (el.wrap === 'off') {
      const caretLeft = elRect.left + (markRect.left - mRect.left);
      const gutterW = gutterRef.current?.offsetWidth ?? 0;
      const hMargin = 24;
      const leftBound = surfRect.left + gutterW + hMargin;
      if (caretLeft < leftBound) {
        surface.scrollLeft -= leftBound - caretLeft;
      } else if (caretLeft > surfRect.right - hMargin) {
        surface.scrollLeft += caretLeft - (surfRect.right - hMargin);
      }
    }
  }, []);

  useEffect(() => () => {
    if (caretMirrorRef.current) {
      caretMirrorRef.current.remove();
      caretMirrorRef.current = null;
    }
  }, []);
  // Soft-wrap long lines (default). When off, full-width text scrolls
  // horizontally instead of wrapping. Wrapping is always on in focus mode (a
  // narrow reading column has nothing to gain from horizontal scroll).
  const wrapText = settings.editorWrap;
  const noWrap = !wrapText && !focusMode;
  // Line numbers are a full-width-mode feature only: the gutter needs the left
  // edge, which fights the centered focus-mode column.
  const lineNumbers = settings.editorLineNumbers && !focusMode;
  // When lines BOTH wrap AND show numbers, the gutter can't use simple
  // line-height arithmetic (a wrapped line spans several rows). Instead we
  // measure each logical line's rendered height from the sizer and size the
  // gutter blocks to match, so one number sits at each line's first row and the
  // wrapped rows stay blank. No-wrap line numbers keep the cheap arithmetic path.
  const measuredGutter = lineNumbers && !noWrap;
  const measuredGutterRef = useRef(measuredGutter);
  measuredGutterRef.current = measuredGutter;

  // Keep the invisible sizer (drives auto-height) and the line-number gutter, if
  // present, in sync with `text`. Stable identity (reads mode from a ref) so the
  // many imperative call sites don't need it in their dep arrays.
  const paintMirror = useCallback((text: string) => {
    const sizer = sizerRef.current;
    const gutter = gutterRef.current;
    if (measuredGutterRef.current) {
      if (sizer) renderLineBlocks(sizer, text, styles.measureLine);
      if (sizer && gutter) {
        const unit = probeRef.current ? probeRef.current.getBoundingClientRect().height : 0;
        syncGutterHeights(sizer, gutter, styles.gutterLine, unit);
      }
    } else {
      if (sizer) sizer.textContent = text + '\n';
      if (gutter) gutter.textContent = lineNumberText(text);
    }
  }, []);

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

  // Clicking the blank area around the text (padding, gutter, margins) would blur
  // the textarea and the caret would vanish. Keep focus on the writing surface so
  // the cursor stays put — the textarea itself still handles clicks on real text.
  const keepFocusInBody = (e: React.MouseEvent) => {
    if (preview) return;
    const el = bodyRef.current;
    if (!el || e.target === el) return;
    e.preventDefault();
    el.focus();
  };

  // Push a programmatic edit (replace) into the uncontrolled textarea + gutter,
  // place the caret, then commit to the draft as one undo step.
  const applyEdit = (next: string, caret: number) => {
    const el = bodyRef.current;
    if (el && !preview) {
      el.value = next;
      paintMirror(next);
      el.setSelectionRange(caret, caret);
      el.focus();
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
    paintMirror(content);
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
    paintMirror(v); // instant height + gutter, no React
    scrollCaretIntoView(); // follow the caret onto its new line
    setContent(v);
  };

  // Keep the caret visible during navigation too (arrows, Home/End, PageUp/Down).
  const onBodyKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End'
      || e.key === 'PageUp' || e.key === 'PageDown') {
      scrollCaretIntoView();
    }
  };

  // Seed / refresh the gutter (and measured-mode sizer blocks) when line numbers
  // or wrap toggle, the font changes, or the view flips edit↔preview. While
  // wrapping with line numbers, also re-measure when the editor width changes
  // (filtered to width so our own height writes don't loop the observer). Typing
  // keeps everything current via onType imperatively.
  useEffect(() => {
    if (preview) return;
    paintMirror(bodyRef.current?.value ?? content);
    if (!measuredGutter) return;
    const area = editAreaRef.current;
    if (!area) return;
    let lastWidth = area.clientWidth;
    const ro = new ResizeObserver((entries) => {
      const w = entries[entries.length - 1].contentRect.width;
      if (Math.abs(w - lastWidth) < 0.5) return;
      lastWidth = w;
      paintMirror(bodyRef.current?.value ?? '');
    });
    ro.observe(area);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineNumbers, measuredGutter, preview, settings.editorFontPx, settings.editorTypeface]);

  // Escape closes the in-note find bar from anywhere (even while typing in the
  // textarea, not just from the find input).
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // Dictation inserts text into the textarea live. While an utterance is in
  // progress its interim text occupies a tracked region [start, start+len] that
  // gets replaced as Whisper refines it (like IME composition); the final result
  // is committed to the draft as a single undo step. partialStart === null means
  // no utterance is open. The region is DOM-only until commit, so interim words
  // don't flood the undo history or autosave.
  const partialStart = useRef<number | null>(null);
  const partialLen = useRef(0);

  // Typewriter reveal: rather than dumping a whole recognized chunk at once
  // (which reads as a jarring paste even when STT is fast), the region streams
  // toward its target text a few chars per frame so dictation feels live.
  // typeTarget is the full text the region should end up showing; partialLen is
  // how much of it is visible so far; typeFinal marks a finalized utterance that
  // commits to the draft once it has fully revealed.
  const typeTarget = useRef('');
  const typeFinal = useRef(false);
  const shownText = useRef(''); // the region's currently-displayed string
  const rafId = useRef<number | null>(null);

  // Replace the current interim region's visible text with `visible`, keeping the
  // caret at its end and the imperative sizer/gutter in sync. Returns the new
  // full textarea value, or null when there's no open region / live textarea.
  const paintRegion = useCallback((visible: string): string | null => {
    const el = bodyRef.current;
    if (!el || partialStart.current === null) return null;
    const start = Math.min(partialStart.current, el.value.length);
    const prevEnd = Math.min(start + partialLen.current, el.value.length);
    const next = el.value.slice(0, start) + visible + el.value.slice(prevEnd);
    el.value = next;
    partialLen.current = visible.length;
    shownText.current = visible;
    const caret = start + visible.length;
    el.setSelectionRange(caret, caret);
    el.focus();
    paintMirror(next);
    return next;
  }, [paintMirror]);

  const stopReveal = useCallback(() => {
    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
  }, []);

  // One animation frame: move the visible region toward typeTarget. Whisper
  // revises interim guesses ("I think" → "I thought"), so when the new target
  // diverges from what's shown we first BACKSPACE (delete) down to the longest
  // common prefix, then type forward again — a visible correction rather than an
  // in-place character swap. Pure appends (the common case) skip straight to
  // typing forward. Steps scale with the distance so it never lags behind speech;
  // backspacing runs a bit faster than typing. Kept in a ref for fresh state.
  const stepRef = useRef<() => void>(() => {});
  stepRef.current = () => {
    rafId.current = null;
    if (partialStart.current === null) return;
    const target = typeTarget.current;
    const shown = shownText.current;
    if (shown === target) {
      if (typeFinal.current) {
        const done = paintRegion(target);
        partialStart.current = null;
        partialLen.current = 0;
        shownText.current = '';
        typeTarget.current = '';
        typeFinal.current = false;
        if (done !== null) setContent(done); // one undo step per utterance; triggers autosave
      }
      return;
    }
    // Longest common prefix of what's shown and where we're headed.
    let cp = 0;
    const max = Math.min(shown.length, target.length);
    while (cp < max && shown[cp] === target[cp]) cp++;
    let visible: string;
    if (shown.length > cp) {
      // Divergent tail still on screen — delete back toward the common prefix.
      const step = Math.max(1, Math.ceil((shown.length - cp) / 4));
      visible = shown.slice(0, Math.max(cp, shown.length - step));
    } else {
      // Shown is a prefix of target — type the rest forward.
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
      const piece = text.trim();
      const el = bodyRef.current;

      // Whole-segment voice command (e.g. a deliberately-paused "new line").
      // Revert any interim text from THIS utterance, then run the action instead
      // of inserting the words.
      if (isFinal) {
        const cmd = matchVoiceCommand(piece);
        if (cmd) {
          stopReveal();
          if (el && !preview) {
            if (partialStart.current !== null) {
              const s = Math.min(partialStart.current, el.value.length);
              const e = Math.min(s + partialLen.current, el.value.length);
              el.value = el.value.slice(0, s) + el.value.slice(e);
              el.setSelectionRange(s, s);
            }
            partialStart.current = null;
            partialLen.current = 0;
            shownText.current = '';
            typeTarget.current = '';
            typeFinal.current = false;
            const caret = el.selectionStart ?? el.value.length;
            const { next, caret: nc } = applyCommandToText(el.value.slice(0, caret), el.value.slice(caret), cmd);
            el.value = next;
            el.setSelectionRange(nc, nc);
            el.focus();
            paintMirror(next);
            setContent(next);
          } else {
            partialStart.current = null;
            partialLen.current = 0;
            shownText.current = '';
            typeTarget.current = '';
            typeFinal.current = false;
            const { next } = applyCommandToText(content, '', cmd);
            setContent(next);
          }
          return;
        }
      }

      // No live textarea (markdown preview): drop interim state; append finals.
      if (!el || preview) {
        stopReveal();
        partialStart.current = null;
        partialLen.current = 0;
        shownText.current = '';
        typeTarget.current = '';
        typeFinal.current = false;
        if (isFinal && piece) {
          const sep = content && !/\s$/.test(content) ? ' ' : '';
          setContent(content + sep + piece);
        }
        return;
      }

      // A new utterance arriving while the previous final is still revealing:
      // flush the old one to its end and commit before opening a fresh region,
      // so nothing spoken is dropped and the regions don't overlap.
      if (typeFinal.current && partialStart.current !== null) {
        stopReveal();
        const done = paintRegion(typeTarget.current);
        partialStart.current = null;
        partialLen.current = 0;
        shownText.current = '';
        typeTarget.current = '';
        typeFinal.current = false;
        if (done !== null) setContent(done);
      }

      // Nothing to show yet and no open region — wait for real words.
      if (!piece && partialStart.current === null) return;

      // Open a fresh region at the caret, inserting a separator if needed.
      if (partialStart.current === null) {
        const caret = el.selectionStart ?? el.value.length;
        const before = el.value.slice(0, caret);
        const sep = before && !/\s$/.test(before) ? ' ' : '';
        if (sep) el.value = before + sep + el.value.slice(caret);
        partialStart.current = caret + sep.length;
        partialLen.current = 0;
      }

      // Aim the region at the latest recognition and let the reveal loop stream
      // toward it; a final commits from inside the loop once fully shown.
      typeTarget.current = piece;
      typeFinal.current = isFinal;
      kickReveal();
    },
    [content, preview, setContent, paintRegion, paintMirror, stopReveal, kickReveal],
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

  // Safety net: if a session ends with interim text still uncommitted (e.g. an
  // error or abrupt stop with no final), flush the region to its full target so
  // words still mid-reveal aren't lost, commit it, and clear the region.
  useEffect(() => {
    if (sttActive || partialStart.current === null) return;
    stopReveal();
    const done = typeTarget.current ? paintRegion(typeTarget.current) : null;
    partialStart.current = null;
    partialLen.current = 0;
    shownText.current = '';
    typeTarget.current = '';
    typeFinal.current = false;
    const finalVal = done ?? bodyRef.current?.value ?? null;
    if (finalVal !== null) setContent(finalVal);
  }, [sttActive, setContent, stopReveal, paintRegion]);

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
            // Don't let the button steal focus from the textarea (the caret would
            // vanish and need a manual click back), then keep focus in the note
            // across the relayout.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void updateSetting('focusMode', !focusMode);
              requestAnimationFrame(() => bodyRef.current?.focus());
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

      <div
        ref={surfaceRef}
        className={cn(styles.surface, noWrap && !preview && styles.surfaceLined)}
        onMouseDown={keepFocusInBody}
      >
        <div className={cn(styles.column, !focusMode && styles.wide, noWrap && !preview && styles.lined, lineNumbers && !preview && styles.linedGutter)}>
          {preview && markdownOn ? (
            <MarkdownView content={content} className={styles.preview} />
          ) : (
            <div ref={editAreaRef} className={cn(styles.editArea, noWrap && styles.nowrap, lineNumbers && styles.withGutter, measuredGutter && styles.measured)}>
              {/* Line-number gutter (logical lines). Kept in sync imperatively
                  alongside the sizer so typing does no React reconciliation. */}
              {lineNumbers && <div className={styles.gutter} aria-hidden ref={gutterRef} />}
              {measuredGutter && <div className={cn(styles.measureLine, styles.lineProbe)} aria-hidden ref={probeRef}>0</div>}
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
                onKeyUp={onBodyKeyUp}
                spellCheck={settings.spellcheck}
                wrap={noWrap ? 'off' : 'soft'}
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
