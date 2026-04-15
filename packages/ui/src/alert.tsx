import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from './cn'

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'destructive'
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'rounded-md border px-4 py-3 text-sm',
        variant === 'default' && 'border-neutral-200 bg-neutral-50 text-neutral-900',
        variant === 'destructive' && 'border-red-300 bg-red-50 text-red-900',
        className,
      )}
      {...props}
    />
  ),
)
Alert.displayName = 'Alert'
