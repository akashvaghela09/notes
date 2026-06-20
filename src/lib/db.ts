import Database from '@tauri-apps/plugin-sql';
import { SQLITE_URL } from './constants';

// Single shared SQLite connection. The Rust side runs migrations on load
// (see src-tauri/lib.rs); here we just attach to the same database.
let _db: Database | null = null;
let _loading: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  if (!_loading) {
    _loading = Database.load(SQLITE_URL).then((db) => {
      _db = db;
      return db;
    });
  }
  return _loading;
}

/** Typed SELECT. Placeholders are `$1, $2, …`. */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

/** Typed SELECT returning the first row or null. */
export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** INSERT/UPDATE/DELETE. */
export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const db = await getDb();
  await db.execute(sql, params);
}

/** Run a set of statements as a transaction (best-effort: plugin-sql has no
 *  explicit tx handle, so we bracket with BEGIN/COMMIT and roll back on error). */
export async function transaction(fn: () => Promise<void>): Promise<void> {
  await execute('BEGIN');
  try {
    await fn();
    await execute('COMMIT');
  } catch (e) {
    await execute('ROLLBACK');
    throw e;
  }
}

// ---- row<->domain conversion helpers (snake_case ↔ camelCase) -------------

export const bool = (v: number | boolean): boolean => v === 1 || v === true;
export const intBool = (v: boolean): number => (v ? 1 : 0);
