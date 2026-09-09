import { useTheme } from './theme-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { PaletteIcon } from 'lucide-react'
import { IconButton } from './ui/icon-button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <IconButton
              asChild
              label="Select theme"
              icon={PaletteIcon}
              variant="outline"
            />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Select theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme('light')}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dmg')}>DMG</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('basic')}>
          BASIC
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('matrix')}>
          MATRIX
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
