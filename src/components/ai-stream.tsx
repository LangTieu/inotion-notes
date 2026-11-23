import type { AiConfig } from "./ai-config"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.trim().replace(/\/+$/, "")}${path}`
}

async function readError(res: Response) {
  try {
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      return json?.error?.message || json?.message || text
    } catch {
      return text
    }
  } catch {
    return ""
  }
}

export async function streamChat({
  config,
  messages,
  signal,
  onToken,
}: {
  config: AiConfig
  messages: ChatMessage[]
  signal?: AbortSignal
  onToken: (token: string) => void
}) {
  const res = await fetch(endpoint(config.baseUrl, "/chat/completions"), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({ model: config.model.trim(), messages, stream: true }),
  })

  if (!res.ok || !res.body) {
    const detail = await readError(res)
    throw new Error(`Request failed (${res.status})${detail ? `: ${detail}` : ""}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (!data) continue
      if (data === "[DONE]") return
      try {
        const token = JSON.parse(data)?.choices?.[0]?.delta?.content
        if (typeof token === "string" && token) onToken(token)
      } catch {
        // Ignore keep-alives and partial JSON frames.
      }
    }
  }
}

export async function testConnection(config: AiConfig, signal?: AbortSignal) {
  const res = await fetch(endpoint(config.baseUrl, "/models"), {
    signal,
    headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
  })
  if (!res.ok) {
    const detail = await readError(res)
    throw new Error(`Connection failed (${res.status})${detail ? `: ${detail}` : ""}`)
  }
  let modelFound: boolean | null = null
  try {
    const json = await res.json()
    if (Array.isArray(json?.data)) {
      modelFound = json.data.some((m: { id?: string }) => m.id === config.model.trim())
    }
  } catch {
    // Some compatible servers return non-standard bodies; a 2xx is enough.
  }
  return { modelFound }
}
