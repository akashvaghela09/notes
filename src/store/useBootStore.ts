import { create } from 'zustand';

/**
 * Transient launch state. The app renders its shell immediately (no spinner
 * gate) while SQLite connects in the background. `bootContent` buffers any
 * keystrokes typed into the instant editor before the real note exists, so
 * nothing is lost during the hand-off to the live editor.
 */
interface BootState {
  /** True once loadAll() + the initial note are ready. */
  hydrated: boolean;
  /** Text typed into the instant editor before the note is created. */
  bootContent: string;
  setHydrated: (v: boolean) => void;
  setBootContent: (c: string) => void;
  clearBootContent: () => void;
}

export const useBootStore = create<BootState>((set) => ({
  hydrated: false,
  bootContent: '',
  setHydrated: (v) => set({ hydrated: v }),
  setBootContent: (c) => set({ bootContent: c }),
  clearBootContent: () => set({ bootContent: '' }),
}));
