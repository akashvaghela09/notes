# Changelog

All notable changes to Slate are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed — UX iteration (feedback round 1)
- **Instant capture / no landing page.** Every launch (and every relaunch)
  opens a fresh, auto-focused empty note in the editor. "All Notes", "Pinned",
  and folders are now browse surfaces reached from the sidebar — there is no
  separate Home page. Blank, untouched notes are auto-pruned on close/startup
  so they never clutter the library.
- **Decluttered top bar.** Removed the Home tab, theme toggle, and settings
  button from the tab bar — it now shows only open tabs + new-note. Settings
  moved to a button in the sidebar footer; theme lives only in Settings (no
  duplicate control). Tab titles update live from the note's first line.
- **Single writing surface.** Removed the separate title field — the note's
  title is always derived from its first line. Removed the distracting focus
  outline on the editor.
- **Notes always belong to a folder.** A default **"Notes"** folder is created
  on first run; new notes fall back to it and deleting a folder re-homes its
  notes there instead of orphaning them. The default folder can't be deleted.
- **Sidebar Pinned section** lists the 5 most-recent pinned notes inline with a
  "Show all" link. Sidebar is now **resizable** (drag handle, width persisted).
- **Explorer-style multi-select** in browse views: hover checkboxes, Ctrl-click
  toggle, Shift-click range, a selection action bar, and a **right-click
  context menu** (Open / Copy / Export / Move to Trash).
- **Context menus render in a portal** positioned at the cursor with viewport
  flipping — folder/note menus no longer clip behind the workspace.
- **PDF export is always clean white** (black text, no theme colors, tints, or
  borders), rendering markdown when enabled or plain text otherwise.
- **Export filenames** derive from the note's first line (no dummy name).
- **Continuous font sizing** via `Ctrl+Shift++` / `Ctrl+Shift+-` (plus S/M/L/XL
  presets and ± steppers in Settings); editor font size is now stored in px.
- **Search field** no longer shifts or shows a border change while typing.

### Added — Project foundation (0.1.0 scaffold)
- **Tooling:** Tauri v2 + React 19 + TypeScript + Vite project scaffolded for
  Linux desktop. Renamed to **Slate** (`com.akash.slate`), window 1200×800
  (min 720×480).
- **Persistence:** `tauri-plugin-sql` (SQLite) registered with versioned
  migrations. Initial schema `0001_initial.sql` with tables: `folders`,
  `notes`, `drafts`, `tabs`, `settings` (+ indexes). Timestamps are unix-ms;
  ids are nanoid strings.
- **Backend plugins:** `sql`, `dialog`, `fs`, `opener` wired in `lib.rs`;
  capabilities updated for SQLite + scoped file read/write (export/import).
- **Dependencies:** zustand (state), react-markdown + remark-gfm +
  rehype-sanitize (markdown), lucide-react (icons), date-fns (dates),
  nanoid (ids).
- **Docs:** `DESIGN.md` — full design system & UX guideline (tokens, color,
  type, layout, the draft/save state machine, component inventory, a11y).
- **Design system:** `styles/tokens.css` (color/type/spacing/radius/shadow/
  motion tokens, light + dark themes), `styles/reset.css`, `styles/global.css`.
- **Data layer:** typed SQLite access (`lib/db.ts`), repositories
  (`features/*/repo.ts`) for notes, folders, drafts, tabs, settings.
- **Utils (DRY):** `id`, `time`, `debounce`, `markdown`, `export`, `cn`.
- **State:** Zustand stores for tabs, notes, folders, settings, UI.
- **Reusable UI:** Button, IconButton, Input, Modal, ConfirmDialog, Menu,
  Tooltip, Segmented, Badge, Pill, EmptyState, Spinner, ColorSwatch, Tile,
  StickyNote, NoteListRow, FolderTree, SidebarItem.
- **Features:** tab bar, sidebar + folder tree, Home (sticky/list views),
  Editor with the draft/autosave/commit model, global search, Settings,
  Trash, export/import backup.

### Notes
- The **draft/save model** is implemented per `DESIGN.md §7`: edits autosave to
  the `drafts` table (crash-safe), `Ctrl+S` commits draft → note, closing a
  dirty tab is the only place a save dialog appears, export reflects the draft.

---

<!--
Template for future entries:

## [x.y.z] - YYYY-MM-DD
### Added
### Changed
### Fixed
### Removed
-->
