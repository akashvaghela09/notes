import { useSettingsStore } from './useSettingsStore';
import { useFoldersStore } from './useFoldersStore';
import { useNotesStore } from './useNotesStore';
import { useTabsStore } from './useTabsStore';
import { notesRepo } from '../features/notes/repo';
import { foldersRepo } from '../features/folders/repo';
import { DEFAULT_FOLDER_NAME, TRASH_RETENTION_MS } from '../lib/constants';
import { mark } from '../utils/perf';

/** Make sure the single primary "Notes" folder exists so notes are never
 *  orphaned. Returns its id. Reuses an existing root folder named "Notes"
 *  before creating a new one, so we never pile up duplicate default folders. */
async function ensureDefaultFolder(currentId: string | null): Promise<string> {
  if (currentId && (await foldersRepo.get(currentId))) return currentId;
  const existing = (await foldersRepo.list()).find(
    (f) => f.parentId === null && f.name === DEFAULT_FOLDER_NAME,
  );
  if (existing) return existing.id;
  const folder = await foldersRepo.create(DEFAULT_FOLDER_NAME, null);
  return folder.id;
}

/** Load all persisted state into the stores. Used on startup and after a
 *  backup import. Ensures the default folder, prunes empties, applies the
 *  trash-retention policy. */
export async function loadAll(): Promise<void> {
  const settings = useSettingsStore.getState();
  // settings.load() triggers the first DB call → SQLite connection + migrations.
  mark('db:connect-start');
  await settings.load();
  mark('db:connect-done');

  const defaultId = await ensureDefaultFolder(settings.settings.defaultFolderId);
  if (defaultId !== settings.settings.defaultFolderId) {
    await settings.update('defaultFolderId', defaultId);
  }

  // Drop blank leftover notes from prior sessions and re-home any orphans.
  await notesRepo.purgeEmpty();
  await notesRepo.reassignOrphansTo(defaultId);

  const retention = useSettingsStore.getState().settings.trashRetention;
  const window = TRASH_RETENTION_MS[retention];
  if (window != null) await notesRepo.purgeTrashedBefore(Date.now() - window);

  await Promise.all([
    useFoldersStore.getState().load(),
    useNotesStore.getState().load(),
    useNotesStore.getState().loadTrash(),
    useTabsStore.getState().load(),
  ]);
  mark('db:tables-loaded');
}

/** Land on a blank, focused note on every launch. Reuses an existing blank,
 *  untouched note if one is still around (so empty notes never pile up);
 *  otherwise creates a fresh one in the default folder. A note that gained
 *  any content/name is left alone and a new blank is shown next launch. */
export async function startFreshNote(): Promise<void> {
  const reusable = await notesRepo.firstEmpty();
  const note = reusable ?? (await useNotesStore.getState().create());
  await useTabsStore.getState().openNote(note.id);
}
