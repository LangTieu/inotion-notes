export type PatScope = {
  id: string
  label: string
  description: string
}

export const DEFAULT_PAT_SCOPES: PatScope[] = [
  { id: "notes:read", label: "Read notes", description: "List, search and read notes" },
  { id: "notes:write", label: "Write notes", description: "Create and edit notes" },
  { id: "notes:delete", label: "Delete notes", description: "Move notes to trash" },
]

export type PersonalAccessToken = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expires_at: number | null
  last_used_at: number | null
  created_at?: number
}

export type CreatePatInput = {
  name: string
  scopes: string[]
  /** Unix milliseconds, or null for a token that never expires. */
  expires_at: number | null
}

export type CreatePatResult = {
  token: PersonalAccessToken
  /** Raw secret. Returned by the server exactly once. */
  raw_token: string
}

export type PatApi = {
  list: () => Promise<PersonalAccessToken[]>
  create: (input: CreatePatInput) => Promise<CreatePatResult>
  revoke: (id: string) => Promise<void>
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const json = await res.json()
      if (json?.error) message = typeof json.error === "string" ? json.error : json.error.message
    } catch {
      // keep default message
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export function createFetchPatApi(basePath = "/api/tokens"): PatApi {
  const toUiToken = (token: PersonalAccessToken): PersonalAccessToken => ({
    ...token,
    scopes: token.scopes.map((scope) => scope.startsWith("notes:") ? scope : `notes:${scope}`),
  })
  return {
    async list() {
      const data = await parse<{ tokens: PersonalAccessToken[] } | PersonalAccessToken[]>(
        await fetch(basePath, { credentials: "same-origin" }),
      )
      return (Array.isArray(data) ? data : data.tokens).map(toUiToken)
    },
    async create(input) {
      const data = await parse<{ token: string } & Omit<PersonalAccessToken, "created_at"> & { created_at: number }>(
        await fetch(basePath, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            scopes: input.scopes.map((scope) => scope.replace(/^notes:/, "")),
          }),
        }),
      )
      return {
        token: toUiToken({ ...data, prefix: data.prefix, scopes: data.scopes }),
        raw_token: data.token,
      }
    },
    async revoke(id) {
      const res = await fetch(`${basePath}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      if (!res.ok) await parse(res)
    },
  }
}

export const MCP_URL = "https://notes.inotion.eu.cc/api/mcp"

export function buildMcpConfig(token = "<YOUR_PAT>") {
  return JSON.stringify(
    {
      mcpServers: {
        inotion: {
          type: "http",
          url: MCP_URL,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  )
}

export function formatDate(timestamp: number | null | undefined, fallback = "Never") {
  if (!timestamp) return fallback
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function isExpired(timestamp: number | null | undefined) {
  if (!timestamp) return false
  return timestamp < Date.now()
}
