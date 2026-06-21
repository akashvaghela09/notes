import { Mic, X, AlertCircle } from 'lucide-react';
import { useSttStore } from '../../store/useSttStore';
import { IconButton } from '../IconButton/IconButton';
import styles from './ListeningIndicator.module.css';

/** Floating overlay shown while dictation is active (or after an error), so the
 *  live microphone is always visible — not just a toggle state. Mounted at the
 *  app root so it appears in any view. The X stops the session. */
export function ListeningIndicator() {
  const session = useSttStore((s) => s.session);
  const stop = useSttStore((s) => s.stopSession);

  const { status } = session;
  const visible = status === 'starting' || status === 'listening' || status === 'transcribing' || status === 'error';
  if (!visible) return null;

  const isError = status === 'error';
  const label =
    status === 'starting' ? 'Starting…'
    : status === 'transcribing' ? 'Transcribing…'
    : status === 'listening' ? 'Listening…'
    : (session.error ?? 'Speech error');

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.pill} data-error={isError || undefined}>
        {isError ? (
          <AlertCircle size={16} className={styles.errIcon} />
        ) : (
          <span className={styles.mic} data-active={status === 'listening' || status === 'transcribing' || undefined}>
            <Mic size={15} />
            <span className={styles.bars} aria-hidden>
              <i /><i /><i /><i />
            </span>
          </span>
        )}
        <span className={styles.label}>{label}</span>
        <IconButton label="Stop dictation" size="sm" onClick={() => void stop()}>
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
}
