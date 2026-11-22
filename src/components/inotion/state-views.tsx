'use client'

import type { ReactNode } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function ErrorBox({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 whitespace-pre-line break-words">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-1.5 font-medium underline underline-offset-2 hover:text-red-800 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none pointer-coarse:min-h-11"
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function BlockError({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-700">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>
      <div className="max-w-xs">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p role="alert" className="mt-1 text-sm text-red-700">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="pointer-coarse:h-11">
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-6">
        {icon}
      </div>
      <div className="max-w-xs">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="divide-y divide-border"
      role="status"
      aria-label="Loading notes"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between gap-6">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  )
}
