import { lazy, Suspense } from 'react';
import { cn } from '../../utils/cn';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

// react-markdown + remark-gfm + rehype-sanitize are heavy and only needed for
// preview/print, so they're split into their own chunk and loaded on demand —
// keeping them off the cold-start path. While the chunk loads we show the raw
// text (readable, and a non-jarring fallback for print).
const MarkdownInner = lazy(() =>
  import('./MarkdownView').then((m) => ({ default: m.MarkdownView })),
);

export function MarkdownView({ content, className }: MarkdownViewProps) {
  return (
    <Suspense
      fallback={
        <div className={cn('markdown', className)} style={{ whiteSpace: 'pre-wrap' }}>
          {content}
        </div>
      }
    >
      <MarkdownInner content={content} className={className} />
    </Suspense>
  );
}
