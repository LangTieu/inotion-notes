"use client"

import { useMemo, useRef, useState } from "react"
import { AiAssistantPanel } from "./ai-assistant-panel"
import { ApiMcpModal } from "./api-mcp-modal"
import { Btn } from "./inotion-ui"
import type { PatApi, PersonalAccessToken } from "./pat-api"

const SAMPLE_NOTE = `Weekly sync - Nov 23

Attendees: Sam, Priya, Jordan.
We agreed the launch slips one week. Priya will update the roadmap by Friday. Jordan needs to confirm the vendor contract, and Sam should send the revised budget to finance.

me and sam was talking about the onboarding flow, there are alot of drop offs at step two.`

function createMockPatApi(): PatApi {
  let tokens: PersonalAccessToken[] = [
    {
      id: "1",
      name: "Claude Code on laptop",
      prefix: "ino_a1b2c3",
      scopes: ["notes:read", "notes:write"],
      expires_at: Date.now() + 30 * 86400000,
      last_used_at: Date.now() - 3600000,
    },
  ]
  return {
    list: async () => tokens,
    create: async (input) => {
      const raw = `ino_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 18)}`
      const token: PersonalAccessToken = {
        id: String(Date.now()),
        name: input.name,
        prefix: raw.slice(0, 10),
        scopes: input.scopes,
        expires_at: input.expires_at,
        last_used_at: null,
      }
      tokens = [token, ...tokens]
      return { token, raw_token: raw }
    },
    revoke: async (id) => {
      tokens = tokens.filter((t) => t.id !== id)
    },
  }
}

export function Phase11Preview() {
  const [text, setText] = useState(SAMPLE_NOTE)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [modalOpen, setModalOpen] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const mockApi = useMemo(() => createMockPatApi(), [])

  const selectedText = text.slice(selection.start, selection.end)

  const syncSelection = () => {
    const el = areaRef.current
    if (!el) return
    if (el.selectionStart !== el.selectionEnd) {
      setSelection({ start: el.selectionStart, end: el.selectionEnd })
    }
  }

  const insertBelow = (value: string) => setText((t) => `${t}\n\n${value}`)

  const replaceSelection = (value: string) => {
    setText((t) => t.slice(0, selection.start) + value + t.slice(selection.end))
    setSelection({ start: 0, end: 0 })
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
        <h1 className="text-sm font-semibold">inotion</h1>
        <Btn onClick={() => setModalOpen(true)}>API / MCP</Btn>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <main className="flex flex-1 flex-col p-4">
          <label htmlFor="note-body" className="sr-only">
            Note body
          </label>
          <textarea
            id="note-body"
            ref={areaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setSelection({ start: 0, end: 0 })
            }}
            onSelect={syncSelection}
            onMouseUp={syncSelection}
            onKeyUp={syncSelection}
            className="min-h-80 w-full flex-1 resize-none rounded-md border border-neutral-200 p-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          />
        </main>

        <div className="h-[32rem] w-full md:h-auto md:w-96">
          <AiAssistantPanel
            noteTitle="Weekly sync"
            noteText={text}
            selectedText={selectedText}
            onInsertBelow={insertBelow}
            onReplaceSelection={replaceSelection}
          />
        </div>
      </div>

      <ApiMcpModal open={modalOpen} onOpenChange={setModalOpen} api={mockApi} />
    </div>
  )
}
