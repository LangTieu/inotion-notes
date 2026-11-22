'use client'

import { Notebook, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileTabBarProps {
  active: 'notes' | 'search'
  onNotes: () => void
  onSearch: () => void
}

export function MobileTabBar({ active, onNotes, onSearch }: MobileTabBarProps) {
  const tab = (isActive: boolean) =>
    cn(
      'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset focus-visible:outline-none',
      isActive ? 'text-blue-600' : 'text-muted-foreground',
    )
  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <button
        type="button"
        onClick={onNotes}
        aria-current={active === 'notes' ? 'page' : undefined}
        className={tab(active === 'notes')}
      >
        <Notebook className="size-5" aria-hidden="true" />
        Notes
      </button>
      <button
        type="button"
        onClick={onSearch}
        aria-current={active === 'search' ? 'page' : undefined}
        className={tab(active === 'search')}
      >
        <Search className="size-5" aria-hidden="true" />
        Search
      </button>
    </nav>
  )
}

export function NewNoteFab({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="New Note"
      className="fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] z-20 flex size-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 md:hidden"
    >
      <Plus className="size-6" aria-hidden="true" />
    </button>
  )
}
