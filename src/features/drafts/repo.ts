import { execute, query, queryOne } from '../../lib/db';
import type { Draft } from '../../types';
import { now } from '../../utils/time';

interface DraftRow {
  note_id: string;
  title: string;
  content: string;
  updated_at: number;
}

const toDraft = (r: DraftRow): Draft => ({
  noteId: r.note_id,
  title: r.title,
  content: r.content,
  updatedAt: r.updated_at,
});

// Drafts are the crash-safe working copy of a note (DESIGN.md §7). A row exists
// only while a note has tracked working edits; committing or discarding removes it.
export const draftsRepo = {
  async get(noteId: string): Promise<Draft | null> {
    const r = await queryOne<DraftRow>('SELECT * FROM drafts WHERE note_id = $1', [noteId]);
    return r ? toDraft(r) : null;
  },

  /** Upsert the autosaved working copy for a note. */
  async save(noteId: string, title: string, content: string): Promise<void> {
    const ts = now();
    await execute(
      `INSERT INTO drafts (note_id, title, content, updated_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(note_id) DO UPDATE SET title = $5, content = $6, updated_at = $7`,
      [noteId, title, content, ts, title, content, ts],
    );
  },

  /** Remove a draft (after commit or discard). */
  async clear(noteId: string): Promise<void> {
    await execute('DELETE FROM drafts WHERE note_id = $1', [noteId]);
  },

  /** Note ids that currently have a draft (to show dirty markers on tabs). */
  async dirtyNoteIds(): Promise<string[]> {
    const rows = await query<{ note_id: string }>('SELECT note_id FROM drafts');
    return rows.map((r) => r.note_id);
  },

  async all(): Promise<Draft[]> {
    const rows = await query<DraftRow>('SELECT * FROM drafts');
    return rows.map(toDraft);
  },
};
