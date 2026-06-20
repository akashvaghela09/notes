import { execute, query, bool } from '../../lib/db';
import type { Tab } from '../../types';
import { newId } from '../../utils/id';

interface TabRow {
  id: string;
  note_id: string;
  position: number;
  is_active: number;
}

const toTab = (r: TabRow): Tab => ({
  id: r.id,
  noteId: r.note_id,
  position: r.position,
  isActive: bool(r.is_active),
});

// Open editor tabs persisted so the workspace restores on relaunch.
export const tabsRepo = {
  async list(): Promise<Tab[]> {
    const rows = await query<TabRow>('SELECT * FROM tabs ORDER BY position ASC');
    return rows.map(toTab);
  },

  async open(noteId: string, position: number): Promise<Tab> {
    const tab: Tab = { id: newId(), noteId, position, isActive: false };
    await execute(
      'INSERT INTO tabs (id, note_id, position, is_active) VALUES ($1,$2,$3,0)',
      [tab.id, noteId, position],
    );
    return tab;
  },

  async close(id: string): Promise<void> {
    await execute('DELETE FROM tabs WHERE id = $1', [id]);
  },

  async setActive(id: string): Promise<void> {
    await execute('UPDATE tabs SET is_active = 0');
    await execute('UPDATE tabs SET is_active = 1 WHERE id = $1', [id]);
  },

  /** Persist a full ordering after reorder/close. */
  async reorder(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await execute('UPDATE tabs SET position = $1 WHERE id = $2', [i, orderedIds[i]]);
    }
  },

  async clearActive(): Promise<void> {
    await execute('UPDATE tabs SET is_active = 0');
  },
};
