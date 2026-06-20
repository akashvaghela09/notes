-- Slate schema v2: user-settable note file name.
-- When blank, the display name is derived from the first ~50 chars of content
-- (see src/utils/markdown.ts noteName/autoName). Append-only: never edit v1.

ALTER TABLE notes ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
