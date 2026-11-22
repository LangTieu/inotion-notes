
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { SessionsPanel } from './sessions-panel'
import { TwoFactorPanel } from './two-factor-panel'

type Tab = 'two-factor' | 'sessions'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'two-factor', label: 'Two-Factor Authentication' },
  { id: 'sessions', label: 'Active Sessions' },
]

interface SecurityModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SecurityModal({ open, onOpenChange }: SecurityModalProps) {
  const [tab, setTab] = useState<Tab>('two-factor')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  // Recovery codes are shown once; closing is blocked until the user confirms.
  const locked = recoveryCodes !== null

  const handleOpenChange = (next: boolean) => {
    if (!next && locked) return
    if (!next) setTab('two-factor')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!locked}
        className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Security</DialogTitle>
          <DialogDescription>
            Protect your private notebook with a second sign-in step and review
            where you are signed in.
          </DialogDescription>
        </DialogHeader>

        <div
          role="tablist"
          aria-label="Security sections"
          className="flex rounded-md bg-secondary p-0.5"
        >
          {TABS.map(({ id, label }) => {
            const selected = tab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`security-tab-${id}`}
                aria-selected={selected}
                aria-controls={`security-panel-${id}`}
                disabled={locked && !selected}
                onClick={() => setTab(id)}
                className={cn(
                  'flex-1 rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-50 pointer-coarse:min-h-11',
                  selected
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div
          role="tabpanel"
          id={`security-panel-${tab}`}
          aria-labelledby={`security-tab-${tab}`}
        >
          {tab === 'two-factor' ? (
            <TwoFactorPanel
              recoveryCodes={recoveryCodes}
              onRecoveryCodes={setRecoveryCodes}
            />
          ) : (
            <SessionsPanel />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
