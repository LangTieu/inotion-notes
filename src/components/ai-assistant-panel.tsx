"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { isAiConfigured, useAiConfig } from "./ai-config"
import { AiOutput } from "./ai-output"
import { AiSettingsForm } from "./ai-settings-form"
import { streamChat, type ChatMessage } from "./ai-stream"
import { Btn, TextInput, cx } from "./inotion-ui"

type ActionId = "summarize" | "rewrite" | "action-items" | "ask"

const ACTIONS: Array<{
  id: Exclude<ActionId, "ask">
  label: string
  outputLabel: string
  prefersSelection: boolean
  system: string
}> = [
  {
    id: "summarize",
    label: "Summarize",
    outputLabel: "Summary",
    prefersSelection: true,
    system:
      "You summarize notes. Return a concise summary in the same language as the note, using short bullet points when helpful. Do not add commentary.",
  },
  {
    id: "rewrite",
    label: "Fix grammar / Rewrite",
    outputLabel: "Rewritten text",
    prefersSelection: true,
    system:
      "You are an editor. Fix grammar, spelling and clarity while preserving the meaning, tone, language and markdown formatting. Return only the revised text with no preface or explanation.",
  },
  {
    id: "action-items",
    label: "Extract action items",
    outputLabel: "Action items",
    prefersSelection: true,
    system:
      "Extract action items from the note. Return a markdown checklist using '- [ ] ' for each item, including owner and due date when mentioned. If there are none, say so in one short sentence.",
  },
]

type RunState = {
  label: string
  text: string
  streaming: boolean
  error: string | null
  selectionAtRun: string
}

const EMPTY_RUN: RunState = {
  label: "",
  text: "",
  streaming: false,
  error: null,
  selectionAtRun: "",
}

export type AiAssistantPanelProps = {
  noteTitle?: string
  /** Full markdown/plain text of the current note. */
  noteText: string
  /** Text currently selected in the editor (empty string when none). */
  selectedText: string
  onInsertBelow: (text: string) => void
  onReplaceSelection: (text: string) => void
  onClose?: () => void
  className?: string
}

export function AiAssistantPanel({
  noteTitle,
  noteText,
  selectedText,
  onInsertBelow,
  onReplaceSelection,
  onClose,
  className,
}: AiAssistantPanelProps) {
  const { config, setConfig, clearConfig, loaded } = useAiConfig()
  const [showSettings, setShowSettings] = useState(false)
  const [question, setQuestion] = useState("")
  const [run, setRun] = useState<RunState>(EMPTY_RUN)
  const abortRef = useRef<AbortController | null>(null)

  const configured = isAiConfigured(config)
  const hasSelection = selectedText.trim().length > 0

  useEffect(() => () => abortRef.current?.abort(), [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setRun((r) => ({ ...r, streaming: false }))
  }, [])

  const execute = useCallback(
    async (label: string, messages: ChatMessage[], selectionAtRun: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setRun({ label, text: "", streaming: true, error: null, selectionAtRun })
      try {
        await streamChat({
          config,
          messages,
          signal: controller.signal,
          onToken: (token) => setRun((r) => ({ ...r, text: r.text + token })),
        })
        setRun((r) => ({ ...r, streaming: false }))
      } catch (err) {
        if (controller.signal.aborted) return
        setRun((r) => ({
          ...r,
          streaming: false,
          error:
            err instanceof Error
              ? err.message
              : "Something went wrong while contacting the AI endpoint.",
        }))
      }
    },
    [config],
  )

  const runAction = (action: (typeof ACTIONS)[number]) => {
    const useSelection = action.prefersSelection && hasSelection
    const source = useSelection ? selectedText : noteText
    if (!source.trim()) {
      setRun({ ...EMPTY_RUN, label: action.outputLabel, error: "This note is empty." })
      return
    }
    void execute(
      action.outputLabel,
      [
        { role: "system", content: action.system },
        {
          role: "user",
          content: `${noteTitle ? `Title: ${noteTitle}\n\n` : ""}${source}`,
        },
      ],
      useSelection ? selectedText : "",
    )
  }

  const runAsk = () => {
    const q = question.trim()
    if (!q) return
    void execute(
      "Answer",
      [
        {
          role: "system",
          content:
            "You answer questions about the user's note. Base your answer on the note content; if the answer is not in the note, say so. Be concise and use markdown.",
        },
        {
          role: "user",
          content: `${noteTitle ? `Title: ${noteTitle}\n` : ""}Note:\n"""\n${noteText}\n"""\n\nQuestion: ${q}`,
        },
      ],
      "",
    )
  }

  const busy = run.streaming
  const actionsDisabled = !configured || busy

  return (
    <aside
      aria-label="AI assistant"
      className={cx(
        "flex h-full w-full flex-col overflow-hidden border-l border-neutral-200 bg-white text-neutral-900",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <h2 className="text-sm font-semibold">AI assistant</h2>
        <div className="flex items-center gap-1">
          <Btn
            variant={showSettings ? "outline" : "ghost"}
            aria-expanded={showSettings}
            onClick={() => setShowSettings((v) => !v)}
          >
            Settings
          </Btn>
          {onClose ? (
            <Btn variant="ghost" onClick={onClose} aria-label="Close AI assistant">
              Close
            </Btn>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {showSettings || (loaded && !configured) ? (
          <section
            aria-label="AI connection settings"
            className="rounded-md border border-neutral-200 p-3"
          >
            <h3 className="mb-0.5 text-xs font-semibold">Bring your own key</h3>
            <p className="mb-3 text-[11px] leading-snug text-neutral-500">
              Works with any OpenAI-compatible endpoint.
            </p>
            <AiSettingsForm config={config} onSave={setConfig} onClear={clearConfig} />
          </section>
        ) : null}

        <section aria-label="Actions" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-neutral-700">Actions</h3>
            <span className="text-[11px] text-neutral-500">
              {hasSelection ? "Applies to selection" : "Applies to whole note"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ACTIONS.map((action) => (
              <Btn
                key={action.id}
                disabled={actionsDisabled}
                onClick={() => runAction(action)}
              >
                {action.label}
              </Btn>
            ))}
          </div>

          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              runAsk()
            }}
          >
            <TextInput
              aria-label="Ask AI about this note"
              placeholder="Ask AI about this note…"
              value={question}
              disabled={!configured}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <Btn
              variant="primary"
              size="md"
              type="submit"
              disabled={actionsDisabled || !question.trim()}
            >
              Ask
            </Btn>
          </form>

          {loaded && !configured ? (
            <p className="text-[11px] text-neutral-500">
              Add an endpoint, model and API key above to enable actions.
            </p>
          ) : null}
        </section>

        <AiOutput
          text={run.text}
          label={run.label}
          streaming={run.streaming}
          error={run.error}
          canReplace={run.selectionAtRun.length > 0}
          onStop={stop}
          onInsertBelow={() => onInsertBelow(run.text)}
          onReplaceSelection={() => onReplaceSelection(run.text)}
        />
      </div>
    </aside>
  )
}
