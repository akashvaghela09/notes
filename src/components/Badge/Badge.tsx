import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import styles from './Badge.module.css';

interface BadgeProps {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'danger';
  className?: string;
}

/** Small count/label chip (folder note counts, trash count, folder tags). */
export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return <span className={cn(styles.badge, styles[tone], className)}>{children}</span>;
}
