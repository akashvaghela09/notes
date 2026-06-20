/** Markdown helper utilities (parsing is done by react-markdown in the
 *  MarkdownView component; these are lightweight text helpers). */

import { NOTE_NAME_MAX } from '../lib/constants';

/** First non-empty content line, stripped of leading markdown heading markers
 *  and capped to `max` chars. The basis for both titles and auto file names. */
export function autoName(content: string, max = 120): string {
  const firstLine = content
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return 'Untitled';
  return firstLine.replace(/^#{1,6}\s+/, '').slice(0, max) || 'Untitled';
}

/** Derive a display title from note content when the title field is empty. */
export function deriveTitle(title: string, content: string): string {
  const t = title.trim();
  return t || autoName(content);
}

/** The name shown for a note everywhere (tabs, cards, sidebar, export):
 *  the user-set file name, or an auto name from the first ~50 chars. */
export function noteName(note: { fileName?: string; content: string }): string {
  return note.fileName?.trim() || autoName(note.content, NOTE_NAME_MAX);
}

/** Plain-text preview for cards/rows: strip common markdown syntax, collapse
 *  whitespace, and cap length. Cheap and good-enough for previews. */
export function previewText(content: string, maxLen = 280): string {
  const text = content
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/(\*\*|__|\*|_|~~|`)/g, '') // emphasis / code ticks
    .replace(/^>\s?/gm, '') // blockquotes
    .replace(/^[-*+]\s+/gm, '• ') // bullets
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
}

/** Count words in content (shown in editor footer). */
export function wordCount(content: string): number {
  const m = content.trim().match(/\S+/g);
  return m ? m.length : 0;
}
