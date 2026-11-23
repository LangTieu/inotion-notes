"use client"

import { useState } from "react"
import { Btn, Spinner } from "./inotion-ui"
import { formatDate, isExpired, type PersonalAccessToken } from "./pat-api"

function PatRow({
  token,
  onRevoke,
}: {
  token: PersonalAccessToken
  onRevoke: (id: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const expired = isExpired(token.expires_at)

  const revoke = async () => {
    setRevoking(true)
    try {
      await onRevoke(token.id)
    } finally {
      setRevoking(false)
      setConfirming(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[13px] font-medium">{token.name}</span>
          <code className="rounded border border-neutral-200 bg-neutral-50 px-1 py-px font-mono text-[11px] text-neutral-600">
            {token.prefix}…
          </code>
          {expired ? (
            <span className="rounded border border-red-200 px-1 py-px text-[10px] font-medium text-red-600">
              Expired
            </span>
          ) : null}
        </div>

        <ul aria-label="Scopes" className="flex flex-wrap gap-1">
          {token.scopes.map((scope) => (
            <li
              key={scope}
              className="rounded border border-neutral-200 px-1.5 py-px font-mono text-[10px] text-neutral-600"
            >
              {scope}
            </li>
          ))}
        </ul>

        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-neutral-500">
          <div className="flex gap-1">
            <dt>Expires</dt>
            <dd className="text-neutral-700">{formatDate(token.expires_at, "Never")}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Last used</dt>
            <dd className="text-neutral-700">{formatDate(token.last_used_at, "Never")}</dd>
          </div>
        </dl>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {confirming ? (
          <>
            <Btn variant="danger" onClick={revoke} disabled={revoking}>
              {revoking ? <Spinner /> : null}
              Confirm revoke
            </Btn>
            <Btn variant="ghost" onClick={() => setConfirming(false)} disabled={revoking}>
              Cancel
            </Btn>
          </>
        ) : (
          <Btn
            variant="danger"
            onClick={() => setConfirming(true)}
            aria-label={`Revoke ${token.name}`}
          >
            Revoke
          </Btn>
        )}
      </div>
    </li>
  )
}

export function PatList({
  tokens,
  loading,
  error,
  onRevoke,
  onRetry,
}: {
  tokens: PersonalAccessToken[] | undefined
  loading: boolean
  error: string | null
  onRevoke: (id: string) => Promise<void>
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-neutral-200 p-3 text-xs text-neutral-500">
        <Spinner /> Loading tokens…
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-2 rounded-md border border-red-200 p-3 text-xs text-red-600"
      >
        <span className="break-words">{error}</span>
        <Btn onClick={onRetry}>Retry</Btn>
      </div>
    )
  }

  if (!tokens || tokens.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500">
        No active tokens yet. Generate one below to connect an API client or MCP agent.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200">
      {tokens.map((token) => (
        <PatRow key={token.id} token={token} onRevoke={onRevoke} />
      ))}
    </ul>
  )
}
