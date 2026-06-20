import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '../../utils/cn';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

/** Safe markdown renderer (GFM + sanitized HTML). Styling lives in the
 *  global `.markdown` class so it inherits theme + editor typography. */
export const MarkdownView = memo(function MarkdownView({
  content,
  className,
}: MarkdownViewProps) {
  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
