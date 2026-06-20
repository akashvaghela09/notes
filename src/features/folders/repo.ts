import { execute, query, queryOne } from '../../lib/db';
import type { Folder } from '../../types';
import { newId } from '../../utils/id';
import { now } from '../../utils/time';

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  position: number;
  created_at: number;
  updated_at: number;
}

const toFolder = (r: FolderRow): Folder => ({
  id: r.id,
  name: r.name,
  parentId: r.parent_id,
  color: r.color,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const foldersRepo = {
  async list(): Promise<Folder[]> {
    const rows = await query<FolderRow>(
      'SELECT * FROM folders ORDER BY position ASC, name COLLATE NOCASE ASC',
    );
    return rows.map(toFolder);
  },

  async get(id: string): Promise<Folder | null> {
    const r = await queryOne<FolderRow>('SELECT * FROM folders WHERE id = $1', [id]);
    return r ? toFolder(r) : null;
  },

  async create(name: string, parentId: string | null = null): Promise<Folder> {
    const ts = now();
    const max = await queryOne<{ m: number | null }>(
      'SELECT MAX(position) AS m FROM folders WHERE parent_id IS $1',
      [parentId],
    );
    const folder: Folder = {
      id: newId(),
      name: name.trim() || 'Untitled folder',
      parentId,
      color: null,
      position: (max?.m ?? -1) + 1,
      createdAt: ts,
      updatedAt: ts,
    };
    await execute(
      `INSERT INTO folders (id, name, parent_id, color, position, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [folder.id, folder.name, folder.parentId, folder.color, folder.position, ts, ts],
    );
    return folder;
  },

  /** Reparent a folder (drag-and-drop). Pass null to move it to the root. */
  async setParent(id: string, parentId: string | null): Promise<void> {
    await execute('UPDATE folders SET parent_id = $1, updated_at = $2 WHERE id = $3', [
      parentId,
      now(),
      id,
    ]);
  },

  async rename(id: string, name: string): Promise<void> {
    await execute('UPDATE folders SET name = $1, updated_at = $2 WHERE id = $3', [
      name.trim() || 'Untitled folder',
      now(),
      id,
    ]);
  },

  /** Delete a folder. Children + contained notes' folder_id handled by FK
   *  (subfolders cascade-delete; notes' folder_id set NULL → become loose). */
  async delete(id: string): Promise<void> {
    await execute('DELETE FROM folders WHERE id = $1', [id]);
  },

  async noteCount(id: string): Promise<number> {
    const r = await queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM notes WHERE folder_id = $1 AND trashed_at IS NULL',
      [id],
    );
    return r?.c ?? 0;
  },

  async all(): Promise<Folder[]> {
    return this.list();
  },
};
