import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Subtle variant for inline / borderless contexts. */
  bare?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { bare, className, ...rest },
  ref,
) {
  return (
    <input ref={ref} className={cn(styles.input, bare && styles.bare, className)} {...rest} />
  );
});
