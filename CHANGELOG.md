# Changelog

All notable changes to Notes are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this project
uses [Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-06-24

### Changed
- **New editor engine (CodeMirror).** The writing surface now runs on CodeMirror
  instead of a plain textarea. Rendering is virtualized, so typing stays fast in
  long notes (the previous editor did work proportional to the note's length on
  every keystroke and slowed down past ~30 lines). Line numbers and text wrapping
  are now native and always aligned, including a single number per wrapped line.
- **Bundled the Inter font.** Inter (the app's intended typeface) now ships with
  the app as a variable font instead of falling back to a system font. Text is
  cleaner and lighter, and the new font-weight setting has real weights to use.

### Added
- **Font weight setting.** Settings → Editor → Font weight (Light / Normal /
  Medium). Applies live to the editor and preview. New installs default to Light.

### Fixed
- **Caret no longer drifts.** Undo/redo now leaves the caret at the edit it
  changed rather than jumping to the end, and the caret stays visible during
  dictation.
- **Smoother typing in large notes.** Edits sync to autosave/undo on a short
  debounce, so steady typing does no per-keystroke React work; saves and exports
  always read the live document so nothing is lost.

## [1.2.5] - 2026-06-23

### Added
- **Wrap text toggle.** New Settings → Editor option (on by default). When on,
  long lines wrap to the next line; when off, full-width text scrolls
  horizontally instead. Wrapping is always on in Focus mode.
- **Line numbers now work with wrapping.** The gutter measures each logical
  line's wrapped height, so a wrapped line keeps a single number and its
  continuation rows stay blank, with numbers staying aligned and evenly spaced.
  Line numbers no longer force a non-wrapping view.

### Changed
- **Dictation types out live.** Transcribed speech now streams into the note
  character by character with an adaptive, ease-out cadence instead of pasting a
  whole sentence at once, so fast speech still feels responsive. When Whisper
  revises an interim guess, the text backspaces to the common prefix and retypes
  rather than swapping characters in place.
- **Dictation mic icon reflects state.** A normal microphone shows while
  listening and a struck-through microphone when dictation is off (matching the
  common meeting-app convention), instead of the inverse.
- **Full-bleed writing area.** In full-width mode the editor fills the entire
  surface: the textarea spans the whole width and height with no dead zone beside
  it and no gaps above or below, while the text keeps a comfortable inset.
- **New-install defaults.** Fresh installs now open full-width with wrap and line
  numbers on. (Existing preferences are kept.)

### Fixed
- **Gutter no longer bleeds through.** The line-number gutter is fully opaque
  (so horizontally scrolled text never shows through it) and has a divider rule
  separating it from the text; its divider now spans the full editor height.
- **Long lines wrap correctly.** A textarea's intrinsic minimum width was
  silently preventing the text column from wrapping; it now wraps as expected.
- **Caret stays in view.** Typing or navigating with the keyboard now scrolls the
  writing surface to keep the caret visible, which the auto-growing editor had
  stopped doing.

## [1.2.4] - 2026-06-22

### Added
- **Line numbers in the editor.** Optional gutter toggled in Settings → Editor.
  Available in full-width mode (Focus mode off); switches the writing surface to
  a non-wrapping, code-editor view with a left-pinned gutter so every line maps
  1:1 to its number.
- **Find and replace.** The in-note find bar gains a Replace toggle with a
  replace field plus **Replace** and **Replace All** actions; replacements commit
  as a single undo step.
- **New note from a folder's context menu.** Right-click a folder → **New note**
  creates a note inside it, expands the folder, and opens it ready to type.
- **Shortcuts:** `Ctrl/Cmd+Shift+Backspace` closes the current note (popping the
  unsaved-changes dialog when needed); `Ctrl/Cmd+Tab` and `Ctrl/Cmd+Shift+Tab`
  cycle forward/backward through open note tabs. Listed in Settings → Shortcuts.

### Changed
- **New folders enter rename immediately.** Creating a folder (sidebar button or
  "New subfolder") drops straight into inline rename with the name selected.
- **Folders section scrolls on its own.** It now takes the sidebar's remaining
  height and scrolls independently, so a large folder/file tree no longer scrolls
  the whole panel; a small bottom padding keeps the last item off the edge.
- **Escape closes search.** Pressing Escape clears/exits the sidebar search and
  closes the in-note find bar.
- **Cleaner tab list on relaunch.** Saved, draft-less tabs are dropped on launch,
  so reopening the app starts with only notes that still have unsaved work.
- **Roomier drag-and-drop.** Dropping a note/folder anywhere in a folder's block
  (header, file rows, or the expanded area) now targets that folder, not just the
  header row.
- **Unsaved-changes dialog** auto-focuses Save so Enter confirms; Esc cancels.
- App keyboard shortcuts no longer fire when **Alt** is held.

### Fixed
- A selected folder no longer stays highlighted after opening/editing a note —
  the active file owns the highlight.
- The editor caret no longer disappears when clicking the blank area around the
  text (clicking anywhere on the writing surface keeps focus in the note).

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
