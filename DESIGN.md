# Slate — Design System & UX Guideline

> A fast, minimal, local-first notes app for Linux desktop.
> This document is the **single source of truth** for visual + interaction design.
> Engineering implements against the tokens and rules here; nothing in the UI
> should use a raw hex value, magic pixel, or ad-hoc animation curve.

---

## 1. Design philosophy

Slate is a **calm, content-first writing tool**. The chrome disappears; the words
are the interface. Three principles govern every decision:

1. **Content is the hero.** Maximum ink for the user's text, minimum ink for our
   UI. Borders are hairlines, surfaces are near-white/near-black, color is used
   only to *mean* something (accent = action, red = destructive, sticky hues =
   user intent).
2. **Instant & honest.** The app must feel like it has no loading state. Theme
   switches, tab switches, and typing have zero perceptible lag. We never lie
   about save state — the draft indicator always reflects reality.
3. **Quiet until needed.** No nagging dialogs, no toasts for routine actions.
   We interrupt the user **only** for genuinely destructive, irreversible
   choices (discarding a draft, emptying trash).

Visual north stars: **Bear, Craft, Linear, Things 3.** Warm neutrals, generous
whitespace, refined typography, one decisive accent, motion that is felt but not
seen.

---

## 2. Color system

All colors are exposed as CSS custom properties and **flip by theme** via a
`data-theme` attribute on `<html>`. Components reference semantic tokens only
(`--color-bg`, `--color-text`), never the raw palette.

### 2.1 Neutral ramp (warm stone — gives notes a paper-like warmth)

| Token            | Light       | Dark        | Use                                   |
| ---------------- | ----------- | ----------- | ------------------------------------- |
| `--bg`           | `#FAFAF9`   | `#1A1917`   | App background (canvas)               |
| `--bg-elevated`  | `#FFFFFF`   | `#232120`   | Cards, sidebar, modals, popovers      |
| `--bg-sunken`    | `#F2F1EF`   | `#141312`   | Wells, inactive tab strip             |
| `--bg-hover`     | `#F2F1EF`   | `#2B2927`   | Hover state on rows/buttons           |
| `--bg-active`    | `#E7E5E4`   | `#332F2D`   | Pressed / selected row                |
| `--border`       | `#E7E5E4`   | `#332F2D`   | Hairline dividers, card outlines      |
| `--border-strong`| `#D6D3D1`   | `#403B38`   | Inputs, focus-adjacent borders        |
| `--text`         | `#1C1917`   | `#FAFAF9`   | Primary text                          |
| `--text-secondary`| `#57534E`  | `#A8A29E`   | Secondary text, metadata              |
| `--text-tertiary`| `#A8A29E`   | `#78716C`   | Placeholders, disabled, timestamps    |
| `--text-inverse` | `#FAFAF9`   | `#1A1917`   | Text on accent fills                  |

### 2.2 Accent (Indigo — confident, modern, not corporate-blue)

| Token              | Light     | Dark      | Use                          |
| ------------------ | --------- | --------- | ---------------------------- |
| `--accent`         | `#5B5BD6` | `#7C7CF0` | Primary actions, active tab indicator, focus ring, links |
| `--accent-hover`   | `#4E4ECC` | `#8E8EF5` | Accent hover                 |
| `--accent-subtle`  | `#EEEEFB` | `#262652` | Tinted backgrounds (selected nav item) |
| `--accent-text`    | `#4A4AC0` | `#A5A5F7` | Accent-colored text on neutral bg |

### 2.3 Semantic

| Token        | Light     | Dark      | Use                       |
| ------------ | --------- | --------- | ------------------------- |
| `--danger`   | `#DC2626` | `#F87171` | Destructive actions, trash |
| `--danger-subtle` | `#FEF2F2` | `#3B1A1A` | Destructive bg tint   |
| `--success`  | `#16A34A` | `#4ADE80` | Saved confirmation        |
| `--warning`  | `#D97706` | `#FBBF24` | Unsaved/draft indicator   |

### 2.4 Sticky-note palette (user-chosen note color)

Soft, equal-weight pastels that read as paper, not UI. Each has a light & dark
variant tuned for the same *perceived* lightness so the home grid feels cohesive.

| Name     | Light bg   | Dark bg    |
| -------- | ---------- | ---------- |
| `default`| `#FFFFFF`  | `#232120`  |
| `yellow` | `#FEF9C3`  | `#3D3A1E`  |
| `green`  | `#DCFCE7`  | `#1E3A2A`  |
| `blue`   | `#DBEAFE`  | `#1E2E45`  |
| `pink`   | `#FCE7F3`  | `#3E1E33`  |
| `purple` | `#EDE9FE`  | `#2E2547`  |
| `orange` | `#FFEDD5`  | `#3E2A18`  |
| `gray`   | `#F1F5F9`  | `#2A2E33`  |

> **Linux/WebKitGTK note:** avoid heavy `backdrop-filter` blur — it janks on
> WebKitGTK. Use solid elevated surfaces + shadow for depth instead.

---

## 3. Typography

| Role          | Family                                              | Notes |
| ------------- | --------------------------------------------------- | ----- |
| UI            | `Inter, -apple-system, system-ui, sans-serif`       | All chrome, labels, buttons |
| Editor (sans) | `Inter` (default)                                   | Body content default |
| Editor (serif)| `'Iowan Old Style', Georgia, serif`                 | Optional reading mode |
| Mono          | `'JetBrains Mono', ui-monospace, monospace`         | Code blocks, raw markdown |

### Type scale (1.25 ratio, rem-based off a 16px root)

| Token        | px (root 16) | Weight | Use                         |
| ------------ | ------------ | ------ | --------------------------- |
| `--fs-xs`    | 11px         | 500    | Timestamps, chips, captions |
| `--fs-sm`    | 13px         | 450    | Secondary UI, metadata      |
| `--fs-base`  | 14px         | 450    | UI default, buttons         |
| `--fs-md`    | 16px         | 450    | Editor body default         |
| `--fs-lg`    | 20px         | 600    | Note title, section heads   |
| `--fs-xl`    | 26px         | 700    | Page titles, empty states   |

- **Line-height:** `1.5` for UI, `1.7` for editor body (reading comfort).
- **Letter-spacing:** `-0.011em` on headings ≥ `--fs-lg` for optical tightness.

### Font-size adjustment (user setting)

The **editor** font size is user-controllable (S / M / L / XL → 14 / 16 / 18 /
20px) via `--editor-font-size`. UI chrome stays fixed so layout never breaks.
Implemented as a single CSS var on the editor root.

---

## 4. Spacing, radius, elevation, motion

### Spacing — 4px base grid

`--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px` ·
`--space-5: 24px` · `--space-6: 32px` · `--space-7: 48px` · `--space-8: 64px`.

### Radius

`--radius-sm: 6px` (chips, inputs) · `--radius-md: 10px` (buttons, cards) ·
`--radius-lg: 14px` (sticky notes, panels) · `--radius-xl: 18px` (modals) ·
`--radius-full: 999px` (pills, avatars).

### Elevation (shadows — soft, layered, never harsh)

- `--shadow-sm`: `0 1px 2px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.06)` — cards.
- `--shadow-md`: `0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04)` — popovers, sticky-note hover.
- `--shadow-lg`: `0 12px 32px rgba(0,0,0,.14), 0 4px 8px rgba(0,0,0,.06)` — modals.
- In dark mode, shadows deepen (`rgba(0,0,0,.4)`) and we add a `1px` top inner
  highlight via border to keep elevated surfaces legible.

### Motion

| Token              | Value                          | Use                    |
| ------------------ | ------------------------------ | ---------------------- |
| `--ease-out`       | `cubic-bezier(.2,.8,.2,1)`     | Most transitions       |
| `--ease-in-out`    | `cubic-bezier(.4,0,.2,1)`      | Movement, reorder      |
| `--dur-fast`       | `120ms`                        | Hover, color, opacity  |
| `--dur-base`       | `180ms`                        | Panels, dropdowns      |
| `--dur-slow`       | `260ms`                        | Modal/overlay enter    |

- Respect `prefers-reduced-motion`: drop transforms, keep opacity ≤ 100ms.
- Never animate `width`/`height`/`top`/`left` for layout — use `transform`.

---

## 5. Layout & information architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  ┌─ Tab bar ──────────────────────────────────────────────┐  ┌─────┐  │
│  │ [Home] [Note A ●] [Note B] [ + ]                        │  │ ⚙ ◐ │  │  ← title/tab bar (40px)
│  └─────────────────────────────────────────────────────────┘  └─────┘  │
├──────────────┬─────────────────────────────────────────────────────────┤
│  SIDEBAR     │  WORKSPACE                                               │
│  (240px,     │                                                          │
│   collapsible)│   ┌─ Home: sticky grid / list ─┐  or  ┌─ Editor ─┐      │
│              │   │                              │      │           │     │
│  🔍 Search   │   │  [note][note][note]          │      │  title    │     │
│  ─────────   │   │  [note][note]                │      │  ───────  │     │
│  ★ All Notes │   │                              │      │  body...  │     │
│  📌 Pinned   │   │                              │      │           │     │
│  🗑 Trash    │   └──────────────────────────────┘      └───────────┘     │
│  ─────────   │                                                          │
│  FOLDERS  +  │                                                          │
│  ▾ 📁 Work   │                                                          │
│    📁 Specs  │                                                          │
│  ▸ 📁 Personal│                                                         │
└──────────────┴─────────────────────────────────────────────────────────┘
```

### Landing model (revised)

There is **no Home landing page**. Every launch opens a fresh, auto-focused
empty note so the user can type immediately; blank untouched notes are pruned
on close. "All Notes", "Pinned", and folders are *browse surfaces* opened from
the sidebar — not a default screen. This keeps the app a writing tool first.

### Regions

- **Tab bar (top, 40px):** open notes as tabs + a `+` new-note button. Nothing
  else — no Home tab, no theme/settings controls (those live in the sidebar /
  Settings to avoid duplication). Active tab shows a 2px accent underline; tab
  titles track the note's first line live.
- **Sidebar (left, resizable 200–480px, drag handle, width persisted;
  collapsible with `Cmd/Ctrl+\`):**
  - Global search field (always at top, no focus chrome shift).
  - **All Notes** and **Trash** (with count badges).
  - **Pinned** section: 5 most-recent pinned notes inline + "Show all".
  - **Folder tree** with inline `+`; folder actions via right-click / hover ⋯
    (portal context menu, never clipped).
  - **Settings** button in the footer.
- **Workspace (fill):** renders the active note's **Editor**, or a **browse**
  view (All Notes / Pinned / folder / search results), or **Trash**.

### Responsive behavior (single window, but resizable)

- < 900px: sidebar auto-collapses to an overlay drawer.
- Sticky grid is fluid: `repeat(auto-fill, minmax(220px, 1fr))`.

---

## 6. Key screens

### 6.1 Home

Two layout modes (user preference in Settings, instant toggle in the home
header):

- **Sticky mode:** masonry-ish grid of note cards. Each card shows title, a
  3–5 line content preview (markdown rendered inline if enabled), folder chip,
  and relative modified time. Card background = note's sticky color. Hover
  lifts with `--shadow-md` + 1px translateY. Pinned notes float to the top with
  a 📌 marker.
- **List mode:** dense rows — title, one-line preview, folder, **created** and
  **modified** columns. Column headers are sortable (modified ▾ default).
  Sort options: modified ⇅, created ⇅, title A–Z, manual.

Home header: title ("All Notes" / folder name), a sort control, and a
segmented **layout switch** (sticky ▦ / list ☰). Empty state is a friendly
centered illustration + "Press ⌘N or just start typing."

> **Selection (revised):** browse views support Explorer-style selection —
> hover checkboxes, Ctrl-click toggle, Shift-click range — with a selection
> action bar and a right-click context menu (Open / Copy / Export / Trash).

### 6.2 Editor

- **Frameless writing surface.** Centered column, max-width `720px`, generous
  side padding. **Single text surface — no separate title field;** the title is
  derived from the first line. No focus outline on the writing area.
- **Markdown:** if enabled, an inline live-preview style — raw shown while the
  block is focused, rendered when blurred (Bear-style). If disabled, plain
  text. A per-note "preview" toggle is available in the editor toolbar.
- **Toolbar (floating, top-right of editor, minimal):** save state pill, note
  color, pin, export, more (⋯ → move to folder, duplicate, delete).
- **Save-state pill** (the heart of the UX — see §7): shows `Saved`,
  `Editing…` (autosaving draft), or `Unsaved changes • ⌘S`.

### 6.3 Settings (modal or full tab)

Grouped sections, each row = label + control + helper text:

- **Appearance:** Theme (System / Light / Dark), Editor font size (S/M/L/XL),
  Editor typeface (Sans / Serif).
- **Editor:** Markdown rendering (on/off), default note color.
- **Home:** Default layout (Sticky / List), default sort.
- **Trash:** Auto-empty (Never / 1 week / 2 weeks / Monthly). Never is default.
- **Data:** Export backup, Import backup, and a danger-zone Empty Trash.

### 6.4 Trash

Same list as Home but read-only rows with **Restore** and **Delete forever**
actions. A banner explains the retention policy. "Empty Trash" is a destructive
button requiring confirmation.

---

## 7. The Draft / Save model (critical UX)

This is Slate's signature interaction. It must be implemented exactly.

### States per open note

```
 committed content (notes.content)  ←─ the "real", saved data
 draft (drafts row)                 ←─ autosaved working copy, may differ
 dirty = draft exists AND draft ≠ committed
```

### Rules

1. **Start typing anywhere → instant draft.** Opening/creating a note lets the
   user type immediately. Every change is **debounced-autosaved (≈400ms) into
   the `drafts` table** in SQLite. This survives crash, force-quit, power loss.
2. **No save nagging during editing.** While editing we never prompt. The
   save-state pill quietly reflects status: `Editing…` → `Unsaved changes`.
3. **Explicit commit only.** `Ctrl+S` or the Save button copies draft →
   `notes.content`, bumps `updated_at`, then **clears the draft row**. Pill
   flips to `Saved` with a brief success tick. This is the *only* path that
   mutates "real" data.
4. **Draft is a sandbox.** The user can freely move back and forth: undo/redo
   within the editor operate on the draft; the committed version is untouched
   until an explicit save. (A "Revert to saved" action in ⋯ discards the draft.)
5. **Closing a tab = leaving edit mode = must be final.** If the note is
   **dirty** when closing the tab, show the **only** save dialog in the app:
   - **Save & Close** (commit draft → close)
   - **Discard** (delete draft → close; reverts to committed)
   - **Cancel** (stay)
   After closing, **no draft row remains** for that note — guaranteed.
6. **Export reflects the DRAFT.** Export/print uses the current working state
   (draft if present, else committed) — "what you see is what you export."

### Save-state pill spec

| State            | Label                  | Color icon         |
| ---------------- | ---------------------- | ------------------ |
| clean            | `Saved`                | `--success` check  |
| autosaving       | `Saving draft…`        | `--text-tertiary`  |
| dirty (idle)     | `Unsaved changes`      | `--warning` dot, hint `⌘S` |
| just-committed   | `Saved` (300ms pop)    | `--success` check  |

---

## 8. Reusable component inventory

Presentational (in `src/components/`, theme-driven, no business logic):

`Button` (primary/secondary/ghost/danger/icon + sizes) · `IconButton` ·
`Icon` (lucide wrapper) · `Input` / `Textarea` · `Modal` · `ConfirmDialog` ·
`Dropdown` / `Menu` · `Tooltip` · `Segmented` (layout/sort switches) ·
`Badge` / `Chip` · `Pill` (save-state) · `Tabs` + `Tab` · `Tile` (generic
card) · `StickyNote` · `NoteListRow` · `FolderTree` + `FolderTreeItem` ·
`SidebarItem` · `EmptyState` · `Spinner` · `ColorSwatch` · `Toolbar`.

**Rules:** every component takes a `className` passthrough, forwards refs where
DOM-bound, derives all styling from tokens, and is keyboard-accessible.

---

## 9. Accessibility & keyboard

- All interactive elements reachable by Tab; visible focus ring
  (`2px var(--accent)` offset). Never remove outlines without replacement.
- Color is never the *only* signal (draft state also has text + icon).
- Contrast ≥ WCAG AA for text on every surface (palette tuned for this).
- **Global shortcuts:** `⌘/Ctrl+N` new note · `⌘/Ctrl+S` save · `⌘/Ctrl+F`
  search · `⌘/Ctrl+W` close tab · `⌘/Ctrl+\` toggle sidebar ·
  `⌘/Ctrl+,` settings · `Ctrl+Tab` cycle tabs · `Esc` close modal/preview.

---

## 10. Iconography & imagery

- **lucide-react**, 1.5px stroke, 18px in UI / 16px inline. Consistent rounded
  joins. Never mix icon sets.
- Empty states: simple line illustration or a single large muted icon + one
  sentence + one action. No stock art.

---

## 11. Voice & microcopy

- Plain, warm, brief. "All notes", not "Note Repository".
- Buttons are verbs: **Save**, **Export**, **Move to Trash**, **Restore**.
- Confirmations state the consequence: *"Discard unsaved changes? Your draft
  will be lost and the note reverts to its last saved version."*
- Never blame the user. Never use exclamation marks in errors.

---

## 12. Implementation contract (for engineering)

1. No raw hex / px in components — only tokens from `styles/tokens.css`.
2. Theme = `data-theme="light|dark"` on `<html>`; `system` resolves via
   `matchMedia`. Switching must not remount React.
3. One CSS Module per component, colocated. Global only = tokens + reset.
4. Components are dumb; data/logic lives in `features/*` + `store/*`.
5. Motion uses the tokens; honor reduced-motion.
6. Every new visual decision updates this doc + `CHANGELOG.md`.
