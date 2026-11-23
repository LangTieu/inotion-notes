"use client"

import { useState } from "react"
import { Btn, useCopy } from "./inotion-ui"
import { MCP_URL, buildMcpConfig } from "./pat-api"

export function McpConfigCopy() {
  const { copied, copy } = useCopy()
  const [preview, setPreview] = useState(false)
  const config = buildMcpConfig()

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-500">
        Point Claude Code, Codex or any MCP client at{" "}
        <code className="rounded border border-neutral-200 bg-neutral-50 px-1 py-px font-mono text-[11px] text-neutral-700">
          {MCP_URL}
        </code>
        . Replace <code className="font-mono text-[11px]">&lt;YOUR_PAT&gt;</code> with a token
        generated above.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Btn variant="primary" onClick={() => copy(config)}>
          <span aria-live="polite">{copied ? "Copied" : "Copy MCP Config JSON"}</span>
        </Btn>
        <Btn variant="ghost" aria-expanded={preview} onClick={() => setPreview((v) => !v)}>
          {preview ? "Hide preview" : "Preview"}
        </Btn>
      </div>

      {preview ? (
        <pre
          tabIndex={0}
          className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-800"
        >
          {config}
        </pre>
      ) : null}
    </div>
  )
}
