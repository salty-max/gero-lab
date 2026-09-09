import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

type ButtonProps = React.ComponentProps<typeof Button>

export interface IconButtonProps extends Omit<ButtonProps, 'children'> {
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
        <TooltipTrigger render={button} />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  }
)

IconButton.displayName = 'IconButton'
