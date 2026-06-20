import { execute, query, queryOne, bool, intBool } from '../../lib/db';
import type { Note, NoteColor, SortPref } from '../../types';
import { newId } from '../../utils/id';
import { now } from '../../utils/time';

interface NoteRow {
  id: string;
  title: string;
  file_name: string;
  content: string;
  folder_id: string | null;
  color: string | null;
  pinned: number;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
}

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  title: r.title,
  fileName: r.file_name ?? '',
  content: r.content,
  folderId: r.folder_id,
  color: (r.color as NoteColor) ?? 'default',
  pinned: bool(r.pinned),
  trashedAt: r.trashed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const ORDER: Record<SortPref['key'], string> = {
  modified: 'updated_at',
  created: 'created_at',
  title: 'title COLLATE NOCASE',
};

/** Build a safe ORDER BY clause. Pinned notes always float to the top. */
function orderClause(sort: SortPref): string {
  const col = ORDER[sort.key];
  const dir = sort.dir === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY pinned DESC, ${col} ${dir}`;
}

export const notesRepo = {
  /** Live notes (not trashed), optionally scoped to a folder. */
  async list(sort: SortPref, folderId?: string | null): Promise<Note[]> {
    const where = folderId === undefined
      ? 'trashed_at IS NULL'
      : 'trashed_at IS NULL AND folder_id IS $1';
    const params = folderId === undefined ? [] : [folderId];
    const rows = await query<NoteRow>(
      `SELECT * FROM notes WHERE ${where} ${orderClause(sort)}`,
      params,
    );
    return rows.map(toNote);
  },

  async listPinned(sort: SortPref): Promise<Note[]> {
    const rows = await query<NoteRow>(
      `SELECT * FROM notes WHERE trashed_at IS NULL AND pinned = 1 ${orderClause(sort)}`,
    );
    return rows.map(toNote);
  },

  async listTrashed(): Promise<Note[]> {
    const rows = await query<NoteRow>(
      'SELECT * FROM notes WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC',
    );
    return rows.map(toNote);
  },

  async get(id: string): Promise<Note | null> {
    const r = await queryOne<NoteRow>('SELECT * FROM notes WHERE id = $1', [id]);
    return r ? toNote(r) : null;
  },

  /** Full-text-ish substring search across title + content (live notes only). */
  async search(term: string): Promise<Note[]> {
    const like = `%${term.trim()}%`;
    const rows = await query<NoteRow>(
      `SELECT * FROM notes
       WHERE trashed_at IS NULL AND (title LIKE $1 OR content LIKE $1)
       ORDER BY updated_at DESC`,
      [like],
    );
    return rows.map(toNote);
  },

  async create(init?: Partial<Pick<Note, 'title' | 'fileName' | 'content' | 'folderId' | 'color'>>): Promise<Note> {
    const ts = now();
    const note: Note = {
      id: newId(),
      title: init?.title ?? '',
      fileName: init?.fileName ?? '',
      content: init?.content ?? '',
      folderId: init?.folderId ?? null,
      color: init?.color ?? 'default',
      pinned: false,
      trashedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    await execute(
      `INSERT INTO notes (id, title, file_name, content, folder_id, color, pinned, trashed_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [note.id, note.title, note.fileName, note.content, note.folderId, note.color, 0, null, ts, ts],
    );
    return note;
  },

  /** Commit content (the only path that mutates saved data). */
  async commit(id: string, title: string, content: string): Promise<void> {
    await execute(
      'UPDATE notes SET title = $1, content = $2, updated_at = $3 WHERE id = $4',
      [title, content, now(), id],
    );
  },

  async setColor(id: string, color: NoteColor): Promise<void> {
    await execute('UPDATE notes SET color = $1 WHERE id = $2', [color, id]);
  },

  /** Set (or clear, with '') the user-defined file name. */
  async setFileName(id: string, fileName: string): Promise<void> {
    await execute('UPDATE notes SET file_name = $1, updated_at = $2 WHERE id = $3', [
      fileName.trim(),
      now(),
      id,
    ]);
  },

  async setPinned(id: string, pinned: boolean): Promise<void> {
    await execute('UPDATE notes SET pinned = $1 WHERE id = $2', [intBool(pinned), id]);
  },

  async move(id: string, folderId: string | null): Promise<void> {
    await execute('UPDATE notes SET folder_id = $1 WHERE id = $2', [folderId, id]);
  },

  async trash(id: string): Promise<void> {
    await execute('UPDATE notes SET trashed_at = $1 WHERE id = $2', [now(), id]);
  },

  async restore(id: string): Promise<void> {
    await execute('UPDATE notes SET trashed_at = NULL WHERE id = $1', [id]);
  },

  /** Permanently delete. Drafts/tabs cascade via FK. */
  async deleteForever(id: string): Promise<void> {
    await execute('DELETE FROM notes WHERE id = $1', [id]);
  },

  async emptyTrash(): Promise<void> {
    await execute('DELETE FROM notes WHERE trashed_at IS NOT NULL');
  },

  /** Delete trashed notes older than the given cutoff (retention policy). */
  async purgeTrashedBefore(cutoff: number): Promise<void> {
    await execute('DELETE FROM notes WHERE trashed_at IS NOT NULL AND trashed_at < $1', [cutoff]);
  },

  /** Delete blank, unpinned, draft-less live notes (startup/close cleanup).
   *  A user-named note (file_name set) is never considered blank. */
  async purgeEmpty(): Promise<void> {
    await execute(
      `DELETE FROM notes
       WHERE trashed_at IS NULL AND pinned = 0
         AND TRIM(title) = '' AND TRIM(content) = '' AND TRIM(file_name) = ''
         AND id NOT IN (SELECT note_id FROM drafts)`,
    );
  },

  /** True if the note has no name, content, or draft (safe to discard). */
  async isEmpty(id: string): Promise<boolean> {
    const r = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM notes n
       WHERE n.id = $1 AND TRIM(n.title) = '' AND TRIM(n.content) = ''
         AND TRIM(n.file_name) = '' AND n.pinned = 0
         AND n.id NOT IN (SELECT note_id FROM drafts)`,
      [id],
    );
    return (r?.c ?? 0) > 0;
  },

  /** A reusable blank, unpinned, draft-less live note, if one exists.
   *  Used on launch to avoid piling up empty notes. */
  async firstEmpty(): Promise<Note | null> {
    const r = await queryOne<NoteRow>(
      `SELECT * FROM notes
       WHERE trashed_at IS NULL AND pinned = 0
         AND TRIM(title) = '' AND TRIM(content) = '' AND TRIM(file_name) = ''
         AND id NOT IN (SELECT note_id FROM drafts)
       ORDER BY created_at DESC LIMIT 1`,
    );
    return r ? toNote(r) : null;
  },

  /** Reassign loose (folder-less) live notes to a fallback folder. */
  async reassignOrphansTo(folderId: string): Promise<void> {
    await execute(
      'UPDATE notes SET folder_id = $1 WHERE folder_id IS NULL AND trashed_at IS NULL',
      [folderId],
    );
  },

  async all(): Promise<Note[]> {
    const rows = await query<NoteRow>('SELECT * FROM notes ORDER BY created_at ASC');
    return rows.map(toNote);
  },
};
