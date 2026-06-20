import { cloneElement, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import styles from './Tooltip.module.css';

interface TooltipProps {
  label: string;
  /** Single focusable/hoverable child element. */
  children: ReactElement<Record<string, unknown>>;
  side?: 'top' | 'bottom';
}

/** Lightweight tooltip. The tip is rendered in a portal with fixed positioning
 *  so it never contributes to a scroll container's overflow (which would flash
 *  a scrollbar). Dependency-free and WebKitGTK-friendly. */
export function Tooltip({ label, children, side = 'bottom' }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: side === 'top' ? r.top - 6 : r.bottom + 6 });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  const child = cloneElement(children, {
    'aria-describedby': open ? id : undefined,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  });

  return (
    <span className={styles.wrap} ref={ref}>
      {child}
      {open &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            className={cn(styles.tip, styles[side])}
            style={{ left: pos.x, top: pos.y }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
