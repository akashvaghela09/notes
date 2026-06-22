import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import type { ButtonVariant } from '../Button/Button';

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional third action, e.g. "Discard" alongside "Save". */
  altLabel?: string;
  tone?: ButtonVariant;
}

interface ConfirmDialogProps extends ConfirmConfig {
  open: boolean;
  onConfirm: () => void;
  onAlt?: () => void;
  onCancel: () => void;
}

/** Reusable confirmation / three-way decision dialog (used by destructive
 *  actions and the close-with-unsaved-draft flow — DESIGN.md §7).
 *
 *  The confirm action is auto-focused on open, so Enter triggers it; Esc cancels
 *  (handled by the Modal). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  altLabel,
  tone = 'primary',
  onConfirm,
  onAlt,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {altLabel && onAlt && (
            <Button variant="secondary" onClick={onAlt}>
              {altLabel}
            </Button>
          )}
          <Button variant={tone} autoFocus onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--text-secondary)', lineHeight: 'var(--lh-read)' }}>{message}</p>
    </Modal>
  );
}
