import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Download, Upload, Palette, Pencil, LayoutGrid, Database, Keyboard, Info,
  Mic, Trash2, Check,
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useNotesStore } from '../../store/useNotesStore';
import { useUIStore } from '../../store/useUIStore';
import { useSttStore } from '../../store/useSttStore';
import { loadAll } from '../../store/bootstrap';
import { exportBackup, importBackup } from '../backup/backup';
import { Modal, Segmented, Switch, ColorPicker, Button, ConfirmDialog, Badge, IconButton, Spinner } from '../../components';
import type { SortKey, ThemePref, TrashRetention } from '../../types';
import { TRASH_RETENTION_LABELS, EDITOR_FONT_PRESETS, clampFontPx, APP_VERSION } from '../../lib/constants';
import { cn } from '../../utils/cn';
import styles from './SettingsModal.module.css';

type TabId = 'appearance' | 'editor' | 'home' | 'speech' | 'data' | 'shortcuts' | 'about';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'editor', label: 'Editor', icon: <Pencil size={16} /> },
  { id: 'home', label: 'Home', icon: <LayoutGrid size={16} /> },
  { id: 'speech', label: 'Speech', icon: <Mic size={16} /> },
  { id: 'data', label: 'Data', icon: <Database size={16} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> },
];

/** Human-readable file size, e.g. 487600000 → "488 MB". */
function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: [MOD, 'N'], desc: 'New note' },
  { keys: [MOD, 'S'], desc: 'Save note' },
  { keys: [MOD, '⇧', '⌫'], desc: 'Close note' },
  { keys: [MOD, 'Tab'], desc: 'Next note tab' },
  { keys: [MOD, '⇧', 'Tab'], desc: 'Previous note tab' },
  { keys: [MOD, 'M'], desc: 'Toggle markdown preview' },
  { keys: [MOD, 'Z'], desc: 'Undo' },
  { keys: [MOD, '⇧', 'Z'], desc: 'Redo' },
  { keys: [MOD, 'F'], desc: 'Find in note' },
  { keys: [MOD, '⇧', 'F'], desc: 'Search all notes' },
  { keys: ['Esc'], desc: 'Close search / dialog' },
  { keys: [MOD, '↓'], desc: 'Next search match' },
  { keys: [MOD, '↑'], desc: 'Previous search match' },
  { keys: [MOD, '\\'], desc: 'Toggle sidebar' },
  { keys: [MOD, ','], desc: 'Open settings' },
  { keys: [MOD, '⇧', '+'], desc: 'Increase editor font size' },
  { keys: [MOD, '⇧', '−'], desc: 'Decrease editor font size' },
  { keys: [MOD, 'Space'], desc: 'Start / stop dictation' },
  { keys: [MOD, '⇧', 'Space'], desc: 'Dictate into a new note' },
];

/** Settings → Speech: enable toggle + the Whisper model manager. */
function SpeechPanel() {
  const s = useSettingsStore((st) => st.settings);
  const update = useSettingsStore((st) => st.update);
  const models = useSttStore((st) => st.models);
  const capabilities = useSttStore((st) => st.capabilities);
  const activeBackend = useSttStore((st) => st.activeBackend);
  const activeDevice = useSttStore((st) => st.activeDevice);
  const downloads = useSttStore((st) => st.downloads);
  const loadModels = useSttStore((st) => st.loadModels);
  const loadCapabilities = useSttStore((st) => st.loadCapabilities);
  const downloadModel = useSttStore((st) => st.downloadModel);
  const deleteModel = useSttStore((st) => st.deleteModel);
  const setModel = useSttStore((st) => st.setModel);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Refresh install status and build capabilities when shown.
  useEffect(() => {
    void loadModels();
    void loadCapabilities();
  }, [loadModels, loadCapabilities]);

  // GPU build → recommend the more accurate models; CPU-only → keep it light.
  const gpuBuild = capabilities?.gpuBuild ?? false;
  const accel =
    activeBackend === 'gpu' ? `Running on GPU${activeDevice ? ` · ${activeDevice}` : ''}`
    : activeBackend === 'cpu' ? 'Running on CPU'
    : gpuBuild ? 'GPU acceleration available. Falls back to CPU if no GPU is found'
    : 'CPU only';

  return (
    <>
      <Row label="Speech-to-text" hint="Offline dictation with a local Whisper model. Nothing is sent to the cloud.">
        <Switch checked={s.sttEnabled} onChange={(v) => update('sttEnabled', v)} label="Speech-to-text" />
      </Row>

      {s.sttEnabled && (
        <div className={styles.models}>
          <div className={styles.modelsHead}>
            <span className={styles.labelText}>Models</span>
            <span className={styles.hint}>Pick a model, then download it. Larger models are more accurate but slower.</span>
            <span className={cn(styles.accel, (activeBackend === 'gpu' || gpuBuild) && styles.accelOn)}>{accel}</span>
          </div>

          {models.map((m) => {
            const dl = downloads[m.id];
            const selected = s.sttModel === m.id;
            return (
              <div key={m.id} className={cn(styles.model, selected && styles.modelSelected)}>
                <button className={styles.modelMain} onClick={() => void setModel(m.id)} aria-pressed={selected}>
                  <span className={cn(styles.radio, selected && styles.radioOn)}>
                    {selected && <Check size={11} />}
                  </span>
                  <span className={styles.modelText}>
                    <span className={styles.modelName}>
                      {m.label}
                      {m.lang === 'multi' && <Badge>Multilingual</Badge>}
                    </span>
                    <span className={styles.hint}>{formatBytes(m.sizeBytes)}</span>
                  </span>
                </button>

                <div className={styles.modelAction}>
                  {dl ? (
                    <div className={styles.progress}>
                      <Spinner size={14} />
                      <span className={styles.progressText}>
                        {dl.total ? `${Math.round((dl.received / dl.total) * 100)}%` : formatBytes(dl.received)}
                      </span>
                    </div>
                  ) : m.downloaded ? (
                    <>
                      <span className={styles.installed}><Check size={14} /> Installed</span>
                      <IconButton label="Delete model" size="sm" tone="danger" onClick={() => setConfirmDelete(m.id)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </>
                  ) : (
                    <Button size="sm" icon={<Download size={15} />} onClick={() => void downloadModel(m.id)}>Download</Button>
                  )}
                </div>
              </div>
            );
          })}

          <p className={styles.sttNote}>
            Press <kbd className={styles.kbd}>{MOD}</kbd> <kbd className={styles.kbd}>Space</kbd> anywhere to start dictation.
            Words appear live as you speak. {gpuBuild
              ? 'With GPU acceleration, Small or Medium give the best accuracy while keeping up in real-time; Tiny and Base are fastest.'
              : 'On CPU, Tiny and Base keep up in real-time; Small and larger will lag behind speech.'}
            {' '}Dictation uses your system default microphone; change it in your OS sound settings.
            You may be asked to allow microphone access the first time.
            {' '}Say “new line”, “new paragraph”, or “delete” (to remove the last sentence) as their own phrase to run them as commands.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete model?"
        message="Remove this model from disk. You can download it again anytime."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => { if (confirmDelete) void deleteModel(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.labelText}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

export function SettingsModal() {
  const open = useUIStore((s) => s.settingsOpen);
  const close = useUIStore((s) => s.closeSettings);
  const s = useSettingsStore((st) => st.settings);
  const update = useSettingsStore((st) => st.update);
  const emptyTrash = useNotesStore((st) => st.emptyTrash);

  const [tab, setTab] = useState<TabId>('appearance');
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const doImport = async () => {
    setConfirmImport(false);
    setImporting(true);
    try {
      const ok = await importBackup();
      if (ok) {
        await loadAll();
        setMsg('Backup imported.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Settings" size="xl" flush>
      <div className={styles.layout}>
        <nav className={styles.nav}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={cn(styles.navItem, tab === t.id && styles.navActive)}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.panel}>
          {tab === 'appearance' && (
            <>
              <Row label="Theme">
                <Segmented<ThemePref>
                  size="sm"
                  value={s.theme}
                  onChange={(v) => update('theme', v)}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </Row>
              <Row label="Editor typeface">
                <Segmented
                  size="sm"
                  value={s.editorTypeface}
                  onChange={(v) => update('editorTypeface', v)}
                  options={[
                    { value: 'sans', label: 'Sans' },
                    { value: 'serif', label: 'Serif' },
                    { value: 'mono', label: 'Mono' },
                  ]}
                />
              </Row>
              <Row label="Default note color">
                <ColorPicker value={s.defaultNoteColor} onChange={(c) => update('defaultNoteColor', c)} />
              </Row>
            </>
          )}

          {tab === 'editor' && (
            <>
              <Row label="Editor font size" hint={`Or adjust live with ${MOD}+⇧+ +  /  −`}>
                <div className={styles.fontControl}>
                  <button className={styles.stepBtn} aria-label="Decrease font size" onClick={() => update('editorFontPx', clampFontPx(s.editorFontPx - 1))}>−</button>
                  <Segmented
                    size="sm"
                    value={String(s.editorFontPx)}
                    onChange={(v) => update('editorFontPx', Number(v))}
                    options={EDITOR_FONT_PRESETS.map((p) => ({ value: String(p.px), label: p.label }))}
                  />
                  <button className={styles.stepBtn} aria-label="Increase font size" onClick={() => update('editorFontPx', clampFontPx(s.editorFontPx + 1))}>+</button>
                  <span className={styles.fontPx}>{s.editorFontPx}px</span>
                </div>
              </Row>
              <Row label="Line numbers" hint="Show a line-number gutter. Full-width mode only (turn off Focus mode).">
                <Switch checked={s.editorLineNumbers} onChange={(v) => update('editorLineNumbers', v)} label="Line numbers" />
              </Row>
              <Row label="Focus mode" hint="Center the writing column at a comfortable width.">
                <Switch checked={s.focusMode} onChange={(v) => update('focusMode', v)} label="Focus mode" />
              </Row>
              <Row label="Markdown rendering" hint="Render markdown in preview and on cards.">
                <Switch checked={s.markdownEnabled} onChange={(v) => update('markdownEnabled', v)} label="Markdown" />
              </Row>
              <Row label="Spellcheck" hint="Native spellcheck. Off keeps typing smoother on long notes.">
                <Switch checked={s.spellcheck} onChange={(v) => update('spellcheck', v)} label="Spellcheck" />
              </Row>
            </>
          )}

          {tab === 'home' && (
            <>
              <Row label="Default layout">
                <Segmented
                  size="sm"
                  value={s.homeLayout}
                  onChange={(v) => update('homeLayout', v)}
                  options={[
                    { value: 'sticky', label: 'Grid' },
                    { value: 'list', label: 'List' },
                  ]}
                />
              </Row>
              <Row label="Show folders in All Notes" hint="Show folders alongside notes on the homepage.">
                <Switch checked={s.homeShowFolders} onChange={(v) => update('homeShowFolders', v)} label="Show folders" />
              </Row>
              <Row label="Default sort">
                <select
                  className={styles.select}
                  value={s.homeSort.key}
                  onChange={(e) => update('homeSort', { ...s.homeSort, key: e.target.value as SortKey })}
                >
                  <option value="modified">Last modified</option>
                  <option value="created">Date created</option>
                  <option value="title">Title</option>
                </select>
              </Row>
            </>
          )}

          {tab === 'speech' && <SpeechPanel />}

          {tab === 'data' && (
            <>
              <Row label="Backup" hint="Export or restore your entire library as a file.">
                <div className={styles.dataBtns}>
                  <Button size="sm" icon={<Download size={15} />} onClick={() => void exportBackup()}>Export</Button>
                  <Button size="sm" icon={<Upload size={15} />} disabled={importing} onClick={() => setConfirmImport(true)}>Import</Button>
                </div>
              </Row>
              <Row label="Auto-empty trash" hint="Permanently remove notes after this period.">
                <select
                  className={styles.select}
                  value={s.trashRetention}
                  onChange={(e) => update('trashRetention', e.target.value as TrashRetention)}
                >
                  {(Object.keys(TRASH_RETENTION_LABELS) as TrashRetention[]).map((k) => (
                    <option key={k} value={k}>{TRASH_RETENTION_LABELS[k]}</option>
                  ))}
                </select>
              </Row>
              <Row label="Empty trash" hint="Permanently delete everything in Trash now.">
                <Button variant="danger" size="sm" onClick={() => setConfirmEmpty(true)}>Empty Trash</Button>
              </Row>
              {msg && <p className={styles.msg}>{msg}</p>}
            </>
          )}

          {tab === 'shortcuts' && (
            <div className={styles.shortcuts}>
              {SHORTCUTS.map((sc) => (
                <div key={sc.desc + sc.keys.join()} className={styles.shortcut}>
                  <span className={styles.shortcutDesc}>{sc.desc}</span>
                  <span className={styles.keys}>
                    {sc.keys.map((k, i) => <kbd key={i} className={styles.kbd}>{k}</kbd>)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'about' && (
            <div className={styles.about}>
              <div className={styles.aboutMark}>Notes</div>
              <div className={styles.aboutVersion}>Version {APP_VERSION}</div>
              <p className={styles.aboutDesc}>
                A fast, minimal, local-first notes app. Your notes live on your device in a local
                database, with no account and no cloud. Built with Tauri, React, and SQLite.
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmImport}
        title="Import backup?"
        message="Importing replaces your current library with the backup’s contents. Export a backup first if you want to keep your current notes."
        confirmLabel="Choose file & import"
        tone="primary"
        onConfirm={doImport}
        onCancel={() => setConfirmImport(false)}
      />
      <ConfirmDialog
        open={confirmEmpty}
        title="Empty Trash?"
        message="Permanently delete all notes in Trash. This cannot be undone."
        confirmLabel="Empty Trash"
        tone="danger"
        onConfirm={() => { void emptyTrash(); setConfirmEmpty(false); }}
        onCancel={() => setConfirmEmpty(false)}
      />
    </Modal>
  );
}
