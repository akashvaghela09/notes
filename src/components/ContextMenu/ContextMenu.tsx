import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItem } from '../Menu/Menu';
import { cn } from '../../utils/cn';
import styles from './ContextMenu.module.css';

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
}

/** Cursor-anchored menu rendered in a portal at the document root, so it is
 *  never clipped by panel overflow. Flips to stay within the viewport. */
export function ContextMenu({ state, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    const pad = 8;
    const x = Math.min(state.x, window.innerWidth - w - pad);
    const y = Math.min(state.y, window.innerHeight - h - pad);
    setPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [state, onClose]);

  if (!state) return null;

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {state.items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          disabled={item.disabled}
          className={cn(styles.item, item.tone === 'danger' && styles.danger, item.separated && styles.separated)}
          onClick={() => {
            onClose();
            item.onClick?.();
          }}
        >
          {item.icon && <span className={styles.icon}>{item.icon}</span>}
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
