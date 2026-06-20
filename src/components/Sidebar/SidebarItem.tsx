import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import styles from './SidebarItem.module.css';

interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  trailing?: ReactNode;
  depth?: number;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/** Generic sidebar navigation row — used for smart lists and folder items. */
export function SidebarItem({
  icon,
  label,
  active,
  trailing,
  depth = 0,
  onClick,
  onContextMenu,
}: SidebarItemProps) {
  return (
    <button
      className={cn(styles.item, active && styles.active)}
      style={{ paddingLeft: `calc(var(--space-3) + ${depth * 14}px)` }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </button>
  );
}
