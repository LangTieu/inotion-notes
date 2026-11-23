"use client"

import { useEffect, useState } from "react"
import { Lock, TriangleAlert } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { SafeMarkdown } from "@/components/safe-markdown"

export interface EncryptedSnapshot {
  /** base64url AES-GCM IV (12 bytes). */
  iv: string
  /** base64url AES-GCM ciphertext including the auth tag. */
  ciphertext: string
}

export interface DecryptedSnapshot {
  title: string
  markdown: string
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function decryptSnapshot(snapshot: EncryptedSnapshot, keyFragment: string): Promise<DecryptedSnapshot> {
  const key = await crypto.subtle.importKey("raw", base64UrlToBytes(keyFragment), { name: "AES-GCM" }, false, [
    "decrypt",
  ])
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(snapshot.iv) },
    key,
    base64UrlToBytes(snapshot.ciphertext),
  )
  const text = new TextDecoder().decode(plain)
  try {
    const parsed = JSON.parse(text) as Partial<DecryptedSnapshot>
    if (typeof parsed.markdown === "string") {
      return { title: parsed.title ?? "Untitled", markdown: parsed.markdown }
    }
  } catch {
    // Plaintext is raw Markdown.
  }
  return { title: "Untitled", markdown: text }
}

function readKeyFromHash() {
  return window.location.hash.replace(/^#/, "").replace(/^k=/, "")
}

type State =
  | { status: "loading" }
  | { status: "missing-key" }
  | { status: "error" }
  | { status: "ready"; note: DecryptedSnapshot }

export function PublicShareView({ snapshot }: { snapshot: EncryptedSnapshot }) {
  const [state, setState] = useState<State>({ status: "loading" })

  useEffect(() => {
    let cancelled = false

    async function run() {
      const keyFragment = readKeyFromHash()
      if (!keyFragment) {
        setState({ status: "missing-key" })
        return
      }
      try {
        const note = await decryptSnapshot(snapshot, keyFragment)
        if (!cancelled) setState({ status: "ready", note })
      } catch {
        if (!cancelled) setState({ status: "error" })
      }
    }

    run()
    const onHashChange = () => {
      setState({ status: "loading" })
      run()
    }
    window.addEventListener("hashchange", onHashChange)
    return () => {
      cancelled = true
      window.removeEventListener("hashchange", onHashChange)
    }
  }, [snapshot])

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-11 max-w-3xl items-center gap-2 px-4 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          Shared note · decrypted in your browser
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {state.status === "loading" && (
          <div role="status" className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Spinner /> Decrypting…
          </div>
        )}

        {(state.status === "missing-key" || state.status === "error") && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {state.status === "missing-key" ? "This link is missing its key" : "Could not decrypt this note"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.status === "missing-key"
                  ? "Ask the sender for the complete link, including everything after the # symbol."
                  : "The key in the link does not match this note, or the link was truncated."}
              </p>
            </div>
          </div>
        )}

        {state.status === "ready" && (
          <article>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{state.note.title}</h1>
            <SafeMarkdown source={state.note.markdown} className="mt-4" />
          </article>
        )}
      </main>
    </div>
  )
}
