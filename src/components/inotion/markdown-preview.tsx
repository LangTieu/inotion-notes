'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Raw HTML in the Markdown source is not rendered (react-markdown escapes it
 * by default) and unsafe URL schemes such as javascript: are stripped.
 */
function MarkdownPreviewImpl({ source }: { source: string }) {
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
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

export const MarkdownPreview = memo(MarkdownPreviewImpl)
