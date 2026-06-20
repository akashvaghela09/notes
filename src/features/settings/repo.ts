import { execute, query } from '../../lib/db';
import { DEFAULT_SETTINGS } from '../../lib/constants';
import type { Settings } from '../../types';

// Settings persist as JSON-encoded key/value rows. We load all rows and merge
// over defaults so missing/new keys always have a sane value.
export const settingsRepo = {
  async load(): Promise<Settings> {
    const rows = await query<{ key: string; value: string }>('SELECT key, value FROM settings');
    const merged: Settings = { ...DEFAULT_SETTINGS };
    for (const { key, value } of rows) {
      if (key in merged) {
        try {
          (merged as unknown as Record<string, unknown>)[key] = JSON.parse(value);
        } catch {
          /* ignore malformed value, keep default */
        }
      }
    }
    return merged;
  },

  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    const json = JSON.stringify(value);
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = $3`,
      [key, json, json],
    );
  },
};
