"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
} from "react"

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: "outline" | "primary" | "danger" | "ghost"
  size?: "sm" | "md"
}

export function Btn({
  variant = "outline",
  size = "sm",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const variants = {
    outline:
      "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50",
    primary: "border border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
    ghost: "border border-transparent text-neutral-600 hover:bg-neutral-100",
  }
  return (
    <button
      type={type}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-8 w-full rounded-md border border-neutral-300 bg-white px-2.5 text-[13px] text-neutral-900",
        "placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-neutral-700">{children}</span>
      {hint ? <span className="text-[11px] text-neutral-500">{hint}</span> : null}
    </label>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-3 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700",
        className,
      )}
    />
  )
}

export function useCopy(resetMs = 1800) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const el = document.createElement("textarea")
        el.value = text
        el.style.position = "fixed"
        el.style.opacity = "0"
        document.body.appendChild(el)
        el.select()
        document.execCommand("copy")
        el.remove()
      }
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
    },
    [resetMs],
  )

  return { copied, copy }
}

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "outline",
  className,
}: {
  value: string
  label?: string
  copiedLabel?: string
  variant?: ButtonProps["variant"]
  className?: string
}) {
  const { copied, copy } = useCopy()
  return (
    <Btn variant={variant} className={className} onClick={() => copy(value)}>
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Btn>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  widthClass = "max-w-2xl",
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  widthClass?: string
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/30 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inotion-modal-title"
        className={cx(
          "w-full rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-xl",
          widthClass,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="inotion-modal-title" className="text-sm font-semibold">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
            ) : null}
          </div>
          <Btn ref={closeRef} variant="ghost" onClick={onClose} aria-label="Close">
            Close
          </Btn>
        </header>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}
