import { createPortal } from 'react-dom';
import { MarkdownView } from '../../components';

interface PrintLayerProps {
  content: string;
  markdown: boolean;
}

/** Print-only rendering of the current working note, portaled outside #root.
 *  Global print CSS hides #root and reveals this, so "Export → PDF" is just
 *  window.print(). Prints ONLY the note's text — no synthetic title/heading,
 *  no extra chrome. Renders the markdown view when markdown is enabled, else
 *  the raw text. Reflects the DRAFT state (what the user sees). */
export function PrintLayer({ content, markdown }: PrintLayerProps) {
  return createPortal(
    <div className="print-only print-page">
      {markdown ? (
        <MarkdownView content={content} />
      ) : (
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{content}</pre>
      )}
    </div>,
    document.body,
  );
}
