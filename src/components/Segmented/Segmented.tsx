import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './Segmented.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label?: string;
  icon?: ReactNode;
  /** Tooltip when only an icon is shown. */
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

/** Compact segmented control for mutually-exclusive choices (layout, sort dir). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div className={cn(styles.group, styles[size])} role="tablist">
      {options.map((opt) => {
        const btn = (
          <button
            key={opt.value}
            role="tab"
            aria-selected={value === opt.value}
            className={cn(styles.seg, value === opt.value && styles.active)}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
            {opt.label && <span>{opt.label}</span>}
          </button>
        );
        return opt.title ? (
          <Tooltip key={opt.value} label={opt.title}>
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}
