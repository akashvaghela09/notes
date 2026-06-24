import { Palette, Pin, Download, AlignCenter, Save } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useBootStore } from '../../store/useBootStore';
import { IconButton, SaveStatePill, Button } from '../../components';
import { wordCount } from '../../utils/markdown';
import { cn } from '../../utils/cn';
import styles from './Editor.module.css';

/**
 * Instant writing surface shown on launch while SQLite connects in the
 * background. The text field is live immediately — keystrokes are buffered in
 * the boot store and handed off to the real <Editor> the moment the note
 * exists. Toolbar actions are disabled until then (nothing to act on yet).
 */
export function BootEditor() {
  const bootContent = useBootStore((s) => s.bootContent);
  const setBootContent = useBootStore((s) => s.setBootContent);
  const settings = useSettingsStore((s) => s.settings);
  const fontFamily =
    settings.editorTypeface === 'serif' ? 'var(--font-serif)'
    : settings.editorTypeface === 'mono' ? 'var(--font-mono)'
    : 'var(--font-ui)';

  return (
    <div
      className={styles.editor}
      style={{
        '--editor-font-size': `${settings.editorFontPx}px`,
        '--editor-font': fontFamily,
        '--editor-font-weight': String(settings.editorFontWeight),
      } as React.CSSProperties}
    >
      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          <IconButton label="Loading…" disabled><AlignCenter size={17} /></IconButton>
          <IconButton label="Loading…" disabled><Palette size={17} /></IconButton>
          <IconButton label="Loading…" disabled><Pin size={17} /></IconButton>
          <IconButton label="Loading…" disabled><Download size={17} /></IconButton>
          <Button variant="primary" size="sm" icon={<Save size={15} />} disabled>Save</Button>
        </div>
        <SaveStatePill state="clean" />
      </div>

      <div className={styles.surface}>
        <textarea
          className={cn(styles.bootBody, settings.focusMode && styles.bootBodyFocus)}
          placeholder="Start typing…"
          value={bootContent}
          onChange={(e) => setBootContent(e.target.value)}
          spellCheck
          autoFocus
        />
      </div>

      <div className={styles.statusbar}>
        <span>{wordCount(bootContent)} words</span>
        <span>Loading…</span>
      </div>
    </div>
  );
}
