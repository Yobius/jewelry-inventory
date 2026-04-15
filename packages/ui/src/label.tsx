import { type LabelHTMLAttributes, forwardRef } from 'react'
import { cn } from './cn'

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is forwarded from consumers
  <label ref={ref} className={cn('text-sm font-medium text-neutral-900', className)} {...props} />
))
Label.displayName = 'Label'
