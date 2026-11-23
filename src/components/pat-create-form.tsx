"use client"

import { useId, useState } from "react"
import { Btn, CopyButton, FieldLabel, Spinner, TextInput } from "./inotion-ui"
import type { CreatePatInput, PatScope } from "./pat-api"

const EXPIRY_OPTIONS = [
  { value: "never", label: "No expiration", days: null },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "1 year", days: 365 },
] as const

export function PatCreateForm({
  scopes,
  onCreate,
}: {
  scopes: PatScope[]
  onCreate: (input: CreatePatInput) => Promise<string>
}) {
  const id = useId()
  const [name, setName] = useState("")
  const [selected, setSelected] = useState<string[]>(scopes.length ? [scopes[0].id] : [])
  const [expiry, setExpiry] = useState<string>("30")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawToken, setRawToken] = useState<string | null>(null)

  const toggleScope = (scopeId: string) =>
    setSelected((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId],
    )

  const canSubmit = name.trim().length > 0 && selected.length > 0 && !submitting

  const submit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const days = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.days ?? null
      const expires_at = days ? Date.now() + days * 24 * 60 * 60 * 1000 : null
      const raw = await onCreate({ name: name.trim(), scopes: selected, expires_at })
      setRawToken(raw)
      setName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create token.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {rawToken ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3"
        >
          <p className="text-xs font-medium text-emerald-900">
            Token created. Copy it now — you won&apos;t be able to see it again.
          </p>
          <div className="flex items-center gap-1.5">
            <code
              data-testid="raw-token"
              className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs text-neutral-900"
            >
              {rawToken}
            </code>
            <CopyButton value={rawToken} />
          </div>
          <div>
            <Btn variant="ghost" onClick={() => setRawToken(null)}>
              I&apos;ve saved it
            </Btn>
          </div>
        </div>
      ) : null}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) void submit()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <TextInput
              id={`${id}-name`}
              placeholder="e.g. Claude Code on laptop"
              maxLength={80}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${id}-expiry`}>Expiration</FieldLabel>
            <select
              id={`${id}-expiry`}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium text-neutral-700">Scopes</legend>
          <div className="flex flex-col gap-1">
            {scopes.map((scope) => {
              const inputId = `${id}-scope-${scope.id}`
              return (
                <label
                  key={scope.id}
                  htmlFor={inputId}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-neutral-200 px-2.5 py-1.5 hover:bg-neutral-50"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-neutral-900"
                    checked={selected.includes(scope.id)}
                    onChange={() => toggleScope(scope.id)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono text-xs text-neutral-900">{scope.id}</span>
                    <span className="text-[11px] text-neutral-500">{scope.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : null}

        <div>
          <Btn variant="primary" size="md" type="submit" disabled={!canSubmit}>
            {submitting ? <Spinner className="border-white/40 border-t-white" /> : null}
            Generate token
          </Btn>
        </div>
      </form>
    </div>
  )
}
