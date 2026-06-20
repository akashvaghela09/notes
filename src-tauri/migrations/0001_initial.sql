-- Slate initial schema (v1)
-- All timestamps are unix epoch milliseconds (INTEGER).
-- IDs are app-generated string ids (nanoid) for offline-safe uniqueness.

PRAGMA foreign_keys = ON;

-- Folders form a tree via parent_id. Root folders have parent_id = NULL.
CREATE TABLE IF NOT EXISTS folders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT 'Untitled folder',
    parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
    color       TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

-- Notes hold the COMMITTED (saved) content. Working edits live in `drafts`.
-- trashed_at = NULL means the note is live; non-NULL means it sits in Trash.
CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    folder_id   TEXT REFERENCES folders(id) ON DELETE SET NULL,
    color       TEXT,
    pinned      INTEGER NOT NULL DEFAULT 0,
    trashed_at  INTEGER,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_folder  ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_trashed ON notes(trashed_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);

-- Drafts: per-note autosaved working state, kept separate from committed content
-- so the user can edit freely and survive crashes without touching saved data.
-- A row exists only while a note has uncommitted working edits being tracked.
CREATE TABLE IF NOT EXISTS drafts (
    note_id     TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    updated_at  INTEGER NOT NULL
);

-- Open editor tabs, persisted so the workspace restores exactly on relaunch.
CREATE TABLE IF NOT EXISTS tabs (
    id          TEXT PRIMARY KEY,
    note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tabs_position ON tabs(position);

-- Simple key/value settings store. Values are JSON-encoded strings.
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);
