import type { NoteColor, Settings, TrashRetention } from '../types';

/** Ordered list of selectable sticky-note colors (drives swatch pickers). */
export const NOTE_COLORS: NoteColor[] = [
  'default',
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'orange',
  'gray',
];

/** Maps a note color to its CSS custom property. Single source of truth. */
export const noteColorVar = (color: NoteColor): string => `var(--note-${color})`;

/** Editor font-size presets (label → px). Continuous sizing via Ctrl+Shift+±. */
export const EDITOR_FONT_PRESETS: { label: string; px: number }[] = [
  { label: 'S', px: 14 },
  { label: 'M', px: 16 },
  { label: 'L', px: 18 },
  { label: 'XL', px: 20 },
];
export const EDITOR_FONT_MIN = 11;
export const EDITOR_FONT_MAX = 28;
export const clampFontPx = (px: number): number =>
  Math.max(EDITOR_FONT_MIN, Math.min(EDITOR_FONT_MAX, Math.round(px)));

/** Trash retention windows in milliseconds. `never` = no auto-empty. */
export const TRASH_RETENTION_MS: Record<TrashRetention, number | null> = {
  never: null,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '2w': 14 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
};

export const TRASH_RETENTION_LABELS: Record<TrashRetention, string> = {
  never: 'Never',
  '1w': 'After 1 week',
  '2w': 'After 2 weeks',
  '1m': 'After 1 month',
};

export const SQLITE_URL = 'sqlite:notes.db';

/** App version shown in Settings → About. Keep in sync with package.json. */
export const APP_VERSION = '1.2.0';

/** Debounce window for draft autosave — batches rapid keystrokes into one write. */
export const DRAFT_AUTOSAVE_MS = 1500;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  markdownEnabled: true,
  editorFontPx: 16,
  editorTypeface: 'sans',
  focusMode: true,
  spellcheck: false,
  homeLayout: 'sticky',
  homeShowFolders: true,
  homeSort: { key: 'modified', dir: 'desc' },
  defaultNoteColor: 'default',
  trashRetention: 'never',
  sidebarCollapsed: false,
  sidebarWidth: 256,
  defaultFolderId: null,
  sttEnabled: false,
  sttModel: null,
};

export const DEFAULT_FOLDER_NAME = 'Notes';
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 480;
/** Recent pinned notes shown inline in the sidebar before "Show all". */
export const SIDEBAR_PINNED_LIMIT = 5;
/** Most-recently-edited notes shown in the sidebar "Recent" section. */
export const SIDEBAR_RECENT_LIMIT = 5;
/** Auto-derived note name length cap (used when no file name is set). */
export const NOTE_NAME_MAX = 50;
