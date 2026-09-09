import type { LogEntry } from '@/hooks/use-vm-log'
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
import { FilterIcon } from 'lucide-react'

type Props = {
  filters: Record<LogEntry['kind'], boolean>
  setFilters: (f: Record<LogEntry['kind'], boolean>) => void
}

export function LogFilters({ filters, setFilters }: Props) {
  const entries: Array<[keyof typeof filters, string]> = [
    ['ready', 'ready'],
    ['info', 'info'],
    ['snapshot', 'snapshot'],
    ['paused', 'paused'],
    ['fault', 'fault'],
    ['mem', 'memory'],
    ['poke', 'poke'],
    ['tick', 'tick'],
    ['irq', 'irq'],
    ['im', 'im mask'],
    ['bp', 'breakpoints'],
    ['run', 'run'],
    ['load', 'load'],
    ['output', 'program output'],
    ['error', 'errors'],
  ]

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <IconButton
              asChild
              variant="outline"
              label="Filter log entries"
              icon={FilterIcon}
            />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Filter log entries</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {entries.map(([k, label]) => (
          <DropdownMenuCheckboxItem
            key={k}
            checked={filters[k]}
            onCheckedChange={(v) => setFilters({ ...filters, [k]: Boolean(v) })}
            onSelect={(e) => e.preventDefault()}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={Object.values(filters).every(Boolean)}
          onCheckedChange={(v) => {
            const next = Boolean(v)
            const out = Object.fromEntries(
              Object.keys(filters).map((k) => [k, next])
            ) as Record<LogEntry['kind'], boolean>
            setFilters(out)
          }}
          onSelect={(e) => e.preventDefault()}
        >
          all
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={Object.values(filters).every((x) => !x)}
          onCheckedChange={() => {
            const out = Object.fromEntries(
              Object.keys(filters).map((k) => [k, false])
            ) as Record<LogEntry['kind'], boolean>
            setFilters(out)
          }}
          onSelect={(e) => e.preventDefault()}
        >
          none
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
