import { execute, query } from '../../lib/db';
import { saveTextToFile, readTextFromFile } from '../../utils/export';
import { fileStamp } from '../../utils/time';

// Full-database backup as a single portable JSON file. Tables are dumped/
// restored raw (snake_case columns) so the format mirrors the schema exactly.

const BACKUP_VERSION = 1;
const TABLES = ['folders', 'notes', 'drafts', 'tabs', 'settings'] as const;

interface Backup {
  app: string;
  version: number;
  exportedAt: number;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Serialize every table and prompt the user to save a .json backup. */
export async function exportBackup(): Promise<string | null> {
  const tables: Backup['tables'] = {};
  for (const t of TABLES) {
    tables[t] = await query<Record<string, unknown>>(`SELECT * FROM ${t}`);
  }
  const backup: Backup = {
    app: 'notes',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    tables,
  };
  return saveTextToFile(JSON.stringify(backup, null, 2), {
    defaultName: `notes-backup-${fileStamp()}.json`,
    filters: [{ name: 'Notes backup', extensions: ['json'] }],
  });
}

/** Pick a backup file and replace the current database with its contents.
 *  Returns true if data was imported, false if cancelled. Throws on bad file. */
export async function importBackup(): Promise<boolean> {
  const text = await readTextFromFile([{ name: 'Notes backup', extensions: ['json'] }]);
  if (text === null) return false;

  const data = JSON.parse(text) as Backup;
  // Accept current ('notes') and legacy ('slate') backups.
  if ((data.app !== 'notes' && data.app !== 'slate') || !data.tables) {
    throw new Error('This file is not a valid Notes backup.');
  }

  // Replace strategy: wipe then re-insert. Order respects FK dependencies.
  await execute('PRAGMA foreign_keys = OFF');
  for (const t of [...TABLES].reverse()) {
    await execute(`DELETE FROM ${t}`);
  }
  for (const t of TABLES) {
    const rows = data.tables[t] ?? [];
    for (const row of rows) {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      await execute(
        `INSERT INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`,
        cols.map((c) => row[c]),
      );
    }
  }
  await execute('PRAGMA foreign_keys = ON');
  return true;
}
