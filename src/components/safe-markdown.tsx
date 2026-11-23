"use client"

import { Fragment, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface MarkdownHeading {
  id: string
  level: number
  text: string
}

type Block =
  | { type: "heading"; level: number; text: string; id: string }
  | { type: "code"; lang: string; text: string }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "hr" }
  | { type: "p"; text: string }

const SAFE_LINK = /^(https?:|mailto:|#|\/(?!\/))/i
const SAFE_IMAGE = /^https:\/\//i

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[`*_~]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "section"
  )
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  const seen = new Map<string, number>()
  let i = 0

  const isBlockStart = (line: string) =>
    /^(#{1,6})\s/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*([-*+]|\d+\.)\s+/.test(line) ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    const fence = line.match(/^```(\w*)/)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      i++
      blocks.push({ type: "code", lang: fence[1], text: code.join("\n") })
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (heading) {
      const text = heading[2]
      const base = slugify(text)
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text,
        id: count ? `${base}-${count}` : base,
      })
      i++
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: "hr" })
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ type: "quote", text: quote.join(" ") })
      continue
    }

    const listMatch = line.match(/^\s*([-*+]|\d+\.)\s+/)
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1])
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+]|\d+\.)\s+(.*)$/)
        if (!m || /\d/.test(m[1]) !== ordered) break
        items.push(m[2])
        i++
      }
      blocks.push({ type: ordered ? "ol" : "ul", items })
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i].trim())
      i++
    }
    if (para.length === 0) {
      para.push(line.trim())
      i++
    }
    blocks.push({ type: "p", text: para.join(" ") })
  }

  return blocks
}

export function extractHeadings(markdown: string): MarkdownHeading[] {
  return parseBlocks(markdown).flatMap((b) =>
    b.type === "heading" ? [{ id: b.id, level: b.level, text: b.text.replace(/[`*_~]/g, "") }] : [],
  )
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(!\[[^\]]*\]\([^)\s]+\))|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/g

function renderInline(text: string, prefix = "i"): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let n = 0

  for (const match of text.matchAll(INLINE)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    const key = `${prefix}-${n++}`

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {renderInline(token.slice(2, -2), key)}
        </strong>,
      )
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={key}>{renderInline(token.slice(2, -2), key)}</del>)
    } else if (token.startsWith("![")) {
      const m = token.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
      if (m && SAFE_IMAGE.test(m[2])) {
        nodes.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={key}
            src={m[2] || "/placeholder.svg"}
            alt={m[1]}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="my-3 max-w-full rounded-md border border-border"
          />,
        )
      } else {
        nodes.push(token)
      }
    } else if (token.startsWith("[")) {
      const m = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      if (m && SAFE_LINK.test(m[2])) {
        const external = /^https?:/i.test(m[2])
        nodes.push(
          <a
            key={key}
            href={m[2]}
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
            className="text-foreground underline underline-offset-2 hover:text-muted-foreground"
          >
            {renderInline(m[1], key)}
          </a>,
        )
      } else {
        nodes.push(m ? m[1] : token)
      }
    } else {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>)
    }
    last = index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

const HEADING_STYLES: Record<number, string> = {
  1: "mt-8 mb-3 text-2xl font-semibold tracking-tight",
  2: "mt-8 mb-2 border-b border-border pb-1 text-xl font-semibold tracking-tight",
  3: "mt-6 mb-2 text-base font-semibold",
  4: "mt-5 mb-1.5 text-sm font-semibold",
  5: "mt-4 mb-1 text-sm font-semibold",
  6: "mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
}

/**
 * Renders Markdown as React elements only. Raw HTML in the source is never
 * interpreted, links are restricted to safe protocols and images to https,
 * so the output is sanitized by construction.
 */
export function SafeMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source)

  return (
    <div className={cn("text-sm leading-relaxed text-foreground", className)}>
      {blocks.map((block, idx) => {
        const key = `b-${idx}`
        switch (block.type) {
          case "heading": {
            const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
            return (
              <Tag key={key} id={block.id} className={cn("scroll-mt-20", HEADING_STYLES[block.level])}>
                {renderInline(block.text, key)}
              </Tag>
            )
          }
          case "code":
            return (
              <pre
                key={key}
                className="my-3 overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed"
              >
                <code data-lang={block.lang || undefined}>{block.text}</code>
              </pre>
            )
          case "quote":
            return (
              <blockquote key={key} className="my-3 border-l-2 border-border pl-3 text-muted-foreground">
                {renderInline(block.text, key)}
              </blockquote>
            )
          case "ul":
            return (
              <ul key={key} className="my-3 list-disc pl-5">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="my-0.5">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ul>
            )
          case "ol":
            return (
              <ol key={key} className="my-3 list-decimal pl-5">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="my-0.5">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ol>
            )
          case "hr":
            return <hr key={key} className="my-6 border-border" />
          default:
            return (
              <Fragment key={key}>
                <p className="my-3">{renderInline(block.text, key)}</p>
              </Fragment>
            )
        }
      })}
    </div>
  )
}
