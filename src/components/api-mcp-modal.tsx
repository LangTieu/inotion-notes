"use client"

import { useMemo, type ReactNode } from "react"
import useSWR from "swr"
import { Modal } from "./inotion-ui"
import { McpConfigCopy } from "./mcp-config-copy"
import { PatCreateForm } from "./pat-create-form"
import { PatList } from "./pat-list"
import {
  DEFAULT_PAT_SCOPES,
  createFetchPatApi,
  type CreatePatInput,
  type PatApi,
  type PatScope,
} from "./pat-api"

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {description ? <p className="text-xs text-neutral-500">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function ApiMcpModal({
  open,
  onOpenChange,
  api,
  scopes = DEFAULT_PAT_SCOPES,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Defaults to fetch-based client hitting /api/tokens. */
  api?: PatApi
  scopes?: PatScope[]
}) {
  const client = useMemo(() => api ?? createFetchPatApi(), [api])

  const { data, error, isLoading, mutate } = useSWR(
    open ? "inotion:pats" : null,
    () => client.list(),
    { revalidateOnFocus: false },
  )

  const handleCreate = async (input: CreatePatInput) => {
    const result = await client.create(input)
    await mutate((prev) => [result.token, ...(prev ?? [])], { revalidate: false })
    return result.raw_token
  }

  const handleRevoke = async (id: string) => {
    await mutate(
      async (prev) => {
        await client.revoke(id)
        return (prev ?? []).filter((t) => t.id !== id)
      },
      {
        optimisticData: (prev) => (prev ?? []).filter((t) => t.id !== id),
        rollbackOnError: true,
        revalidate: false,
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="API / MCP access"
      description="Personal access tokens let scripts and AI agents use your notes."
    >
      <div className="flex flex-col gap-6">
        <Section title="Active tokens">
          <PatList
            tokens={data}
            loading={isLoading}
            error={error ? (error instanceof Error ? error.message : "Could not load tokens.") : null}
            onRevoke={handleRevoke}
            onRetry={() => void mutate()}
          />
        </Section>

        <hr className="border-neutral-200" />

        <Section title="Generate new token">
          <PatCreateForm scopes={scopes} onCreate={handleCreate} />
        </Section>

        <hr className="border-neutral-200" />

        <Section title="MCP configuration">
          <McpConfigCopy />
        </Section>
      </div>
    </Modal>
  )
}
