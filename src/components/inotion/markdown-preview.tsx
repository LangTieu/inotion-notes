'use client'

import { Children, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Raw HTML in the Markdown source is not rendered (react-markdown escapes it
 * by default) and unsafe URL schemes such as javascript: are stripped.
 */
function MarkdownPreviewImpl({ source, onToggleTask }: { source: string; onToggleTask?: (line: number, checked: boolean) => void }) {
  if (!source.trim()) {
    return <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
  }
  return (
    <div className="md-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          img: ({ node: _node, alt, ...props }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img {...props} alt={alt ?? ''} loading="lazy" />
          ),
          li: ({ node: _node, children, ...props }) => {
            const childNodes=Children.toArray(children);
            const task=typeof childNodes[0]==='object'&&childNodes[0]&&'props' in childNodes[0]&&(childNodes[0] as any).props?.type==='checkbox';
            const checkbox=task?childNodes[0] as any:null;
            const text=task?childNodes.slice(1):childNodes;
            const line=Number(((_node as any)?.position?.start?.line||1))-1;
            return <li {...props}>{checkbox&&onToggleTask?<input type="checkbox" checked={!!checkbox.props.checked} onChange={e=>onToggleTask(line,e.target.checked)} className="mr-2 align-middle" aria-label="Toggle task"/>:null}{text}</li>
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

export const MarkdownPreview = memo(MarkdownPreviewImpl)
