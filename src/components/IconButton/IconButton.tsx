import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './IconButton.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label; also shown as a tooltip. */
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
  tone?: 'default' | 'danger';
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, size = 'md', active, tone = 'default', className, children, ...rest },
    ref,
  ) {
    return (
      <Tooltip label={label}>
        <button
          ref={ref}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            styles.btn,
            styles[size],
            active && styles.active,
            tone === 'danger' && styles.danger,
            className,
          )}
          {...rest}
        >
          {children}
        </button>
      </Tooltip>
    );
  },
);
