'use client'

import { type ReactNode, useEffect } from 'react'
import { cn } from './cn'

export type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
        aria-label="Закрыть диалог"
      />
      {/* biome-ignore lint/a11y/useSemanticElements: native <dialog> doesn't compose with backdrop button for click-outside; we own focus mgmt */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 max-h-[90vh] w-full max-w-md overflow-auto rounded-lg border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-800 dark:bg-neutral-900',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-1">{children}</div>
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{children}</h2>
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-500 dark:text-neutral-400">{children}</p>
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>
}
