# Changelog

All notable changes to Notes are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project
uses [Semantic Versioning](https://semver.org/).

## [1.2.1] - 2026-06-21

### Added — Offline speech-to-text (dictation)
- **Local Whisper dictation, fully offline.** Speech recognition runs on-device
  via whisper.cpp (the `whisper-rs` crate) with continuous streaming and
  energy-based voice-activity detection. No audio leaves the machine.
- **Live, interim transcription.** Text appears as you speak (interim results
  refresh ~3x/second and are committed as one undo step per utterance), with a
  long silence window so natural pauses don't chop a sentence.
- **Model manager** in Settings → Speech: a master enable toggle, plus per-model
  Download / Installed state, a delete (trash) action, and a download progress
  bar. Models: Tiny / Base / Small / Medium (English) and Small (multilingual),
  fetched once from the public ggerganov/whisper.cpp repo into the app data dir.
- **GPU acceleration (Vulkan)** with automatic best-device selection: prefers a
  discrete GPU, enables NVIDIA PRIME render-offload on hybrid laptops, never the
  CPU/lavapipe software driver, and falls back to CPU when no GPU is available.
  The active backend/device is shown in Settings.
- **Toolbar dictation section** (just before Settings, shown only when enabled
  with a model installed): a styled model picker dropdown (downloaded models
  only) and a mic toggle. Switching the model restarts a live session so it
  applies immediately.
- **Shortcuts:** `Ctrl/Cmd+Space` starts/stops dictation in the current note (or
  a new one); `Ctrl/Cmd+Shift+Space` dictates into a fresh note. Listed in
  Settings → Shortcuts.
- **Listening indicator:** a floating, animated overlay with a close button so
  the live microphone is always visible (not just a toggle state).
- **Voice commands** (recognized only as a whole, deliberately-paused phrase):
  "new line" / "next line", "new paragraph", and "delete" (removes the last
  sentence). The same words spoken inside a sentence are dictated as text.

### Changed
- Version bumped to **1.2.0**; About now reflects the real app version.
- Removed all em-dashes from user-facing UI copy.

### CI / Build
- Release workflow now installs the whisper.cpp / cpal build prerequisites
  (cmake, libclang, ALSA on Linux) and builds **CPU-only** portable installers
  via `--no-default-features` (no Vulkan/CUDA runtime required to run them). The
  GPU build remains the local default; see `GIT.md`.
- Fixed the release workflow passing `--no-default-features` to `tauri build`
  directly (rejected); it is now forwarded to cargo as `-- --no-default-features`.
- Set the macOS `minimumSystemVersion` to 10.15 so whisper.cpp's `std::filesystem`
  use compiles (the default 10.13 marked it unavailable).

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
  Linux desktop. Named **Notes** (`com.akash.notes`), window 1200×800
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
