"use client"

import { useEffect, useId, useRef, useState } from "react"
import { DEFAULT_AI_CONFIG, isAiConfigured, type AiConfig } from "./ai-config"
import { testConnection } from "./ai-stream"
import { Btn, FieldLabel, Spinner, TextInput } from "./inotion-ui"

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string }

export function AiSettingsForm({
  config,
  onSave,
  onClear,
}: {
  config: AiConfig
  onSave: (config: AiConfig) => void
  onClear: () => void
}) {
  const id = useId()
  const [draft, setDraft] = useState<AiConfig>(config)
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<TestState>({ status: "idle" })
  const [saved, setSaved] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setDraft(config)
  }, [config])

  useEffect(() => () => abortRef.current?.abort(), [])

  const update = (patch: Partial<AiConfig>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSaved(false)
    setTest({ status: "idle" })
  }

  const runTest = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setTest({ status: "testing" })
    try {
      const { modelFound } = await testConnection(draft, controller.signal)
      setTest({
        status: "ok",
        message:
          modelFound === false
            ? "Connected, but the model was not listed by the endpoint."
            : "Connection successful.",
      })
    } catch (err) {
      if (controller.signal.aborted) return
      setTest({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not reach the endpoint. Check the URL and CORS settings.",
      })
    }
  }

  const canTest = isAiConfigured(draft) && test.status !== "testing"

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(draft)
        setSaved(true)
      }}
    >
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={`${id}-url`}>Endpoint URL</FieldLabel>
        <TextInput
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://api.openai.com/v1"
          value={draft.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={`${id}-model`}>Model</FieldLabel>
        <TextInput
          id={`${id}-model`}
          autoComplete="off"
          spellCheck={false}
          placeholder={DEFAULT_AI_CONFIG.model}
          value={draft.model}
          onChange={(e) => update({ model: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={`${id}-key`}>API key</FieldLabel>
        <div className="flex gap-1.5">
          <TextInput
            id={`${id}-key`}
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-..."
            value={draft.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
          <Btn
            size="md"
            onClick={() => setShowKey((v) => !v)}
            aria-pressed={showKey}
          >
            {showKey ? "Hide" : "Show"}
          </Btn>
        </div>
        <p className="text-[11px] leading-snug text-neutral-500">
          Stored only in this browser&apos;s localStorage and sent directly to the
          endpoint above. It is never uploaded to inotion.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="primary" type="submit">
          {saved ? "Saved" : "Save"}
        </Btn>
        <Btn onClick={runTest} disabled={!canTest}>
          {test.status === "testing" ? <Spinner /> : null}
          Test connection
        </Btn>
        <Btn
          variant="ghost"
          onClick={() => {
            onClear()
            setDraft(DEFAULT_AI_CONFIG)
            setTest({ status: "idle" })
            setSaved(false)
          }}
        >
          Clear
        </Btn>
      </div>

      <div aria-live="polite" className="min-h-4 text-xs">
        {test.status === "ok" ? (
          <p className="text-emerald-700">{test.message}</p>
        ) : null}
        {test.status === "error" ? (
          <p className="break-words text-red-600">{test.message}</p>
        ) : null}
      </div>
    </form>
  )
}
