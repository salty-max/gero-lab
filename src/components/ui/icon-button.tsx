import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button, type ButtonProps } from './button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

export interface IconButtonProps
  extends Omit<ButtonProps, 'children' | 'asChild'> {
  label: string
  icon: LucideIcon
  asChild?: boolean
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon: Icon, asChild, size = 'icon', ...props }, ref) => {
    const button = (
      <Button
        ref={ref}
        size={size}
        title={asChild ? undefined : label}
        aria-label={label}
        {...props}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </Button>
    )

    if (asChild) return button

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  }
)

IconButton.displayName = 'IconButton'
