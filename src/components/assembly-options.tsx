import { IconButton } from './ui/icon-button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { SettingsIcon } from 'lucide-react'

type Props = {
  codeOnly: boolean
  setCodeOnly: (v: boolean) => void
  showBytes: boolean
  setShowBytes: (v: boolean) => void
}

export function AssemblyOptions({
  codeOnly,
  setCodeOnly,
  showBytes,
  setShowBytes,
}: Props) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <IconButton
              asChild
              variant="outline"
              label="Assembly options"
              icon={SettingsIcon}
            />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Assembly options</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Display</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={codeOnly}
          onCheckedChange={(v) => setCodeOnly(Boolean(v))}
          onSelect={(e) => e.preventDefault()}
        >
          code only
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={showBytes}
          onCheckedChange={(v) => setShowBytes(Boolean(v))}
          onSelect={(e) => e.preventDefault()}
        >
          show bytes
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
