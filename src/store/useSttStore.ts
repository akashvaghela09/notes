import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { SttModelInfo, SttState } from '../types';
import { useSettingsStore } from './useSettingsStore';
import { useTabsStore } from './useTabsStore';
import { useNotesStore } from './useNotesStore';
import { useUIStore } from './useUIStore';

/** A session is "active" (mic engaged) for any of these states. */
const ACTIVE: SttState[] = ['starting', 'listening', 'transcribing'];
export const isSttActive = (s: SttState): boolean => ACTIVE.includes(s);

interface DownloadProgress {
  received: number;
  total: number;
}

interface SttSession {
  status: SttState;
  /** Note the dictation was started against (for reference; text routes via the sink). */
  targetNoteId: string | null;
  error: string | null;
}

/** Recognized text delivered to the active editor. `isFinal` distinguishes a
 *  committed segment from a live interim result that should replace the prior one. */
export type TranscriptSink = (text: string, isFinal: boolean) => void;

interface SttStore {
  models: SttModelInfo[];
  /** Build capabilities (whether GPU acceleration is compiled in). null = unknown. */
  capabilities: { gpuBuild: boolean } | null;
  /** Backend actually in use during the current session (from `stt://backend`). */
  activeBackend: 'gpu' | 'cpu' | null;
  /** GPU device name in use this session (e.g. "NVIDIA GeForce GTX 1650"). */
  activeDevice: string | null;
  session: SttSession;
  /** In-flight downloads keyed by model id. */
  downloads: Record<string, DownloadProgress>;
  /** The active editor registers a sink that inserts recognized text at the caret. */
  sink: TranscriptSink | null;

  loadModels: () => Promise<void>;
  loadCapabilities: () => Promise<void>;
  /** Set the active recognition model; restarts a live session so it takes effect now. */
  setModel: (id: string) => Promise<void>;
  downloadModel: (id: string) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  startSession: (opts?: { newNote?: boolean }) => Promise<void>;
  stopSession: () => Promise<void>;
  toggleSession: (opts?: { newNote?: boolean }) => Promise<void>;
  registerSink: (fn: TranscriptSink) => void;
  clearSink: (fn: TranscriptSink) => void;
}

const idleSession: SttSession = { status: 'idle', targetNoteId: null, error: null };

export const useSttStore = create<SttStore>((set, get) => ({
  models: [],
  capabilities: null,
  activeBackend: null,
  activeDevice: null,
  session: idleSession,
  downloads: {},
  sink: null,

  async loadModels() {
    try {
      const models = await invoke<SttModelInfo[]>('stt_list_models');
      set({ models });
    } catch (e) {
      console.error('[stt] list models failed', e);
    }
  },

  async loadCapabilities() {
    try {
      const capabilities = await invoke<{ gpuBuild: boolean }>('stt_capabilities');
      set({ capabilities });
    } catch (e) {
      console.error('[stt] capabilities failed', e);
    }
  },

  async setModel(id) {
    if (useSettingsStore.getState().settings.sttModel === id) return;
    const wasActive = isSttActive(get().session.status);
    await useSettingsStore.getState().update('sttModel', id);
    // If dictation is live, restart it so the newly chosen model loads now
    // (the current model is held for the whole session otherwise).
    if (wasActive) {
      await get().stopSession();
      await get().startSession({ newNote: false });
    }
  },

  async downloadModel(id) {
    set((s) => ({ downloads: { ...s.downloads, [id]: { received: 0, total: 0 } } }));
    try {
      await invoke('stt_download_model', { modelId: id });
    } catch (e) {
      console.error('[stt] download failed', e);
    } finally {
      await get().loadModels();
      set((s) => {
        const next = { ...s.downloads };
        delete next[id];
        return { downloads: next };
      });
    }
  },

  async deleteModel(id) {
    await invoke('stt_delete_model', { modelId: id });
    await get().loadModels();
  },

  async startSession(opts = {}) {
    const { settings } = useSettingsStore.getState();
    if (!settings.sttEnabled) return;

    // Pick the chosen model, falling back to any installed one.
    const installed = get().models.filter((m) => m.downloaded);
    if (installed.length === 0) return;
    const chosen = installed.find((m) => m.id === settings.sttModel) ?? installed[0];

    // Clear any lingering/finished session in the backend before starting fresh.
    if (get().session.status !== 'idle') await get().stopSession();

    // Resolve where dictated text should go.
    const tabs = useTabsStore.getState();
    let targetNoteId: string;
    const active = tabs.activeNoteId();
    const onEditor = useUIStore.getState().view === 'editor';
    if (opts.newNote || !active || !onEditor) {
      const note = await useNotesStore.getState().create();
      await tabs.openNote(note.id);
      targetNoteId = note.id;
    } else {
      targetNoteId = active;
    }

    set({ session: { status: 'starting', targetNoteId, error: null } });
    try {
      await invoke('stt_start', { modelId: chosen.id });
    } catch (e) {
      set({ session: { status: 'error', targetNoteId: null, error: String(e) } });
    }
  },

  async stopSession() {
    try {
      await invoke('stt_stop');
    } catch (e) {
      console.error('[stt] stop failed', e);
    }
    set({ session: idleSession, activeBackend: null, activeDevice: null });
  },

  async toggleSession(opts) {
    if (isSttActive(get().session.status)) {
      await get().stopSession();
      return;
    }
    await get().startSession(opts);
  },

  registerSink(fn) {
    set({ sink: fn });
  },
  clearSink(fn) {
    // Only clear if it's still the current sink (avoids a remount clobbering a newer one).
    if (get().sink === fn) set({ sink: null });
  },
}));

// ---- One-time event wiring ------------------------------------------------

let initialized = false;

interface StateEventPayload { state: string; modelId?: string | null; message?: string | null }
interface TranscriptPayload { text: string; segmentIndex: number }
interface PartialPayload { text: string }
interface DownloadProgressPayload { modelId: string; received: number; total: number }
interface DownloadDonePayload { modelId: string }
interface DownloadErrorPayload { modelId: string; message: string }

/** Register the Rust → frontend STT event listeners exactly once. Safe to call
 *  repeatedly (e.g. React 19 StrictMode double-mount) — only the first wins. */
export function initStt(): void {
  if (initialized) return;
  initialized = true;

  void listen<StateEventPayload>('stt://state', ({ payload }) => {
    const set = useSttStore.setState;
    const cur = useSttStore.getState().session;
    switch (payload.state) {
      case 'starting':
      case 'listening':
      case 'transcribing':
        set({ session: { ...cur, status: payload.state, error: null } });
        break;
      case 'error':
        set({ session: { ...cur, status: 'error', error: payload.message ?? 'speech engine error' } });
        break;
      case 'stopped':
        // Preserve an error so the user can see it; otherwise return to idle.
        if (cur.status !== 'error') set({ session: idleSession, activeBackend: null, activeDevice: null });
        break;
    }
  });

  void listen<{ gpu: boolean; device: string | null }>('stt://backend', ({ payload }) => {
    useSttStore.setState({ activeBackend: payload.gpu ? 'gpu' : 'cpu', activeDevice: payload.device ?? null });
  });

  void listen<TranscriptPayload>('stt://transcript', ({ payload }) => {
    useSttStore.getState().sink?.(payload.text, true);
  });

  void listen<PartialPayload>('stt://partial', ({ payload }) => {
    useSttStore.getState().sink?.(payload.text, false);
  });

  void listen<DownloadProgressPayload>('stt://download-progress', ({ payload }) => {
    useSttStore.setState((s) => ({
      downloads: { ...s.downloads, [payload.modelId]: { received: payload.received, total: payload.total } },
    }));
  });

  void listen<DownloadDonePayload>('stt://download-done', () => {
    void useSttStore.getState().loadModels();
  });

  void listen<DownloadErrorPayload>('stt://download-error', ({ payload }) => {
    useSttStore.setState((s) => {
      const next = { ...s.downloads };
      delete next[payload.modelId];
      return { downloads: next };
    });
  });
}
