import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Download, Upload, Palette, Pencil, LayoutGrid, Database, Keyboard, Info,
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useNotesStore } from '../../store/useNotesStore';
import { useUIStore } from '../../store/useUIStore';
import { loadAll } from '../../store/bootstrap';
import { exportBackup, importBackup } from '../backup/backup';
import { Modal, Segmented, Switch, ColorPicker, Button, ConfirmDialog } from '../../components';
import type { SortKey, ThemePref, TrashRetention } from '../../types';
import { TRASH_RETENTION_LABELS, EDITOR_FONT_PRESETS, clampFontPx, APP_VERSION } from '../../lib/constants';
import { cn } from '../../utils/cn';
import styles from './SettingsModal.module.css';

type TabId = 'appearance' | 'editor' | 'home' | 'data' | 'shortcuts' | 'about';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'editor', label: 'Editor', icon: <Pencil size={16} /> },
  { id: 'home', label: 'Home', icon: <LayoutGrid size={16} /> },
  { id: 'data', label: 'Data', icon: <Database size={16} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> },
];

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: [MOD, 'N'], desc: 'New note' },
  { keys: [MOD, 'S'], desc: 'Save note' },
  { keys: [MOD, 'M'], desc: 'Toggle markdown preview' },
  { keys: [MOD, 'Z'], desc: 'Undo' },
  { keys: [MOD, '⇧', 'Z'], desc: 'Redo' },
  { keys: [MOD, 'F'], desc: 'Find in note' },
  { keys: [MOD, '⇧', 'F'], desc: 'Search all notes' },
  { keys: [MOD, '↓'], desc: 'Next search match' },
  { keys: [MOD, '↑'], desc: 'Previous search match' },
  { keys: [MOD, '\\'], desc: 'Toggle sidebar' },
  { keys: [MOD, ','], desc: 'Open settings' },
  { keys: [MOD, '⇧', '+'], desc: 'Increase editor font size' },
  { keys: [MOD, '⇧', '−'], desc: 'Decrease editor font size' },
];

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
                database — no account, no cloud. Built with Tauri, React, and SQLite.
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
