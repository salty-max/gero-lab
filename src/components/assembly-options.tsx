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
}

// `show bytes` is not offered: the module's `gero_disasm` has no flag
// for the hex column its `PrintOptions` can print, and a toggle that
// does nothing is worse than one that is absent.
export function AssemblyOptions({ codeOnly, setCodeOnly }: Props) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<IconButton
              asChild
              variant="outline"
              label="Assembly options"
              icon={SettingsIcon}
            />} />} />
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
