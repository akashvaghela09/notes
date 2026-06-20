import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { Note } from '../../types';
import { noteName } from '../../utils/markdown';
import { cn } from '../../utils/cn';
import styles from './Home.module.css';

interface SearchResultsProps {
  results: Note[];
  query: string;
  folderName: Map<string, string>;
  onOpen: (id: string) => void;
}

/** Highlight every occurrence of `query` (case-insensitive) within `text`. */
function highlight(text: string, query: string): ReactNode[] {
  const q = query.toLowerCase();
  const hay = text.toLowerCase();
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = hay.indexOf(q);
  let key = 0;
  while (i !== -1 && q) {
    if (i > last) nodes.push(text.slice(last, i));
    nodes.push(<mark key={key++} className={styles.resultMark}>{text.slice(i, i + q.length)}</mark>);
    last = i + q.length;
    i = hay.indexOf(q, last);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** A one-line context snippet around the first match. */
function snippet(content: string, query: string): string {
  const i = content.toLowerCase().indexOf(query.toLowerCase());
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (i === -1) return flat(content).slice(0, 140);
  const start = Math.max(0, i - 40);
  const end = Math.min(content.length, i + query.length + 80);
  return (start > 0 ? '… ' : '') + flat(content.slice(start, end)) + (end < content.length ? ' …' : '');
}

/** Global search results: each row shows where the match is, navigable with
 *  Up/Down and openable with Enter. */
export function SearchResults({ results, query, folderName, onOpen }: SearchResultsProps) {
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSel(0); }, [query, results.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const n = results[sel]; if (n) onOpen(n.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [results, sel, onOpen]);

  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  return (
    <div className={styles.results} ref={listRef}>
      {results.map((n, i) => (
        <button
          key={n.id}
          data-sel={i === sel ? 'true' : undefined}
          className={cn(styles.result, i === sel && styles.resultSel)}
          onClick={() => onOpen(n.id)}
          onMouseEnter={() => setSel(i)}
        >
          <span className={styles.resultHead}>
            <FileText size={14} className={styles.resultIcon} />
            <span className={styles.resultTitle}>{highlight(noteName(n), query)}</span>
            {n.folderId && folderName.get(n.folderId) && (
              <span className={styles.resultFolder}>{folderName.get(n.folderId)}</span>
            )}
          </span>
          <span className={styles.resultSnippet}>{highlight(snippet(n.content, query), query)}</span>
        </button>
      ))}
    </div>
  );
}
