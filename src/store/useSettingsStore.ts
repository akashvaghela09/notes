import { create } from 'zustand';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '../lib/constants';
import { settingsRepo } from '../features/settings/repo';

// Boot-critical layout prefs are mirrored to localStorage so the very first
// render (before SQLite loads) uses the user's real sidebar width/collapsed
// state. Without this, the sidebar launches at the default width and then
// jumps when settings hydrate from the database.
const BOOT_KEY = 'notes:ui';
type BootPrefs = Partial<Pick<Settings, 'sidebarWidth' | 'sidebarCollapsed'>>;

function readBootPrefs(): BootPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(BOOT_KEY) || '{}') as BootPrefs;
    if (typeof p.sidebarWidth === 'number') {
      p.sidebarWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, p.sidebarWidth));
    }
    return p;
  } catch {
    return {};
  }
}

function writeBootPref(key: 'sidebarWidth' | 'sidebarCollapsed', value: number | boolean): void {
  try {
    localStorage.setItem(BOOT_KEY, JSON.stringify({ ...readBootPrefs(), [key]: value }));
  } catch {
    /* ignore storage failures */
  }
}

const initialSettings: Settings = { ...DEFAULT_SETTINGS, ...readBootPrefs() };

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: initialSettings,
  loaded: false,

  async load() {
    const settings = await settingsRepo.load();
    set({ settings, loaded: true });
    // Mirror the DB's layout prefs to localStorage so the NEXT launch seeds the
    // correct sidebar width/collapsed state — even if the user never resizes.
    writeBootPref('sidebarWidth', settings.sidebarWidth);
    writeBootPref('sidebarCollapsed', settings.sidebarCollapsed);
  },

  async update(key, value) {
    // Optimistic: apply immediately, persist in background.
    set({ settings: { ...get().settings, [key]: value } });
    // Keep the localStorage mirror in sync so the next launch starts correctly.
    if (key === 'sidebarWidth') writeBootPref('sidebarWidth', value as number);
    else if (key === 'sidebarCollapsed') writeBootPref('sidebarCollapsed', value as boolean);
    await settingsRepo.set(key, value);
  },
}));
