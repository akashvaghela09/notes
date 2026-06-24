// Domain types shared across the app. These mirror the SQLite schema
// (see src-tauri/migrations/0001_initial.sql) but use camelCase in JS.

export type NoteColor =
  | 'default'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'pink'
  | 'purple'
  | 'orange'
  | 'gray';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  title: string;
  /** User-set file name. Blank = derive a display name from `content`
   *  (see noteName/autoName in utils/markdown). */
  fileName: string;
  /** Committed (saved) content. Working edits live in `Draft`. */
  content: string;
  folderId: string | null;
  color: NoteColor;
  pinned: boolean;
  /** null = live note; number = epoch-ms it was moved to trash. */
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Draft {
  noteId: string;
  title: string;
  content: string;
  updatedAt: number;
}

export interface Tab {
  id: string;
  noteId: string;
  position: number;
  isActive: boolean;
}

// ---- Settings -------------------------------------------------------------

export type ThemePref = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type HomeLayout = 'sticky' | 'list';
export type EditorTypeface = 'sans' | 'serif' | 'mono';
export type TrashRetention = 'never' | '1w' | '2w' | '1m';
export type SortKey = 'modified' | 'created' | 'title';
export type SortDir = 'asc' | 'desc';

export interface SortPref {
  key: SortKey;
  dir: SortDir;
}

// ---- Speech-to-text -------------------------------------------------------

/** A Whisper model in the catalog, with on-disk install status (from Rust). */
export interface SttModelInfo {
  id: string;
  label: string;
  sizeBytes: number;
  downloaded: boolean;
  lang: 'en' | 'multi';
}

/** Lifecycle of a dictation session, mirrored from the Rust `stt://state` event. */
export type SttState = 'idle' | 'starting' | 'listening' | 'transcribing' | 'error';

export interface Settings {
  theme: ThemePref;
  markdownEnabled: boolean;
  /** Editor font size in px. Adjustable continuously via Ctrl+Shift+±. */
  editorFontPx: number;
  editorTypeface: EditorTypeface;
  /** Editor text font weight (e.g. 300 light, 400 normal, 500 medium). */
  editorFontWeight: number;
  /** Show a line-number gutter in the editor. */
  editorLineNumbers: boolean;
  /** Soft-wrap long lines. Off → full-width text scrolls horizontally. On by
   *  default; takes precedence over line numbers (which need no-wrap). */
  editorWrap: boolean;
  /** Focused (narrow, centered) writing column vs. full-width editor. */
  focusMode: boolean;
  /** Native spellcheck in the editor. Off by default — it can stutter typing
   *  on large notes (re-checks on word/line boundaries). */
  spellcheck: boolean;
  homeLayout: HomeLayout;
  /** In "All Notes", show folders alongside notes (homepage), vs. notes only. */
  homeShowFolders: boolean;
  homeSort: SortPref;
  defaultNoteColor: NoteColor;
  trashRetention: TrashRetention;
  sidebarCollapsed: boolean;
  /** Persisted sidebar width in px (resizable). */
  sidebarWidth: number;
  /** Folder every orphan note falls back to; auto-created on first run. */
  defaultFolderId: string | null;
  /** Master switch for offline speech-to-text (dictation). */
  sttEnabled: boolean;
  /** Catalog id of the Whisper model used for recognition (null = none chosen). */
  sttModel: string | null;
}
