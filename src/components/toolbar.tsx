import { useState } from 'react'
import { u16, fmt16 } from '@/lib/format'
import {
  PlayIcon,
  PauseIcon,
  StepForwardIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { ProgramEditor } from './program-editor'
import { MemoryWritePopover } from './memory-write-popover'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Separator } from './ui/separator'
import { Slider } from './ui/slider'
import { useProgram } from '@/contexts/program-context'
import { useVM } from '@/contexts/vm-context'

export function ToolBar() {
  const program = useProgram()
  const vm = useVM()
  const [delay, setDelay] = useState(vm.speedSteps - 1)
  const entryHex = fmt16(u16(program.entry), true)

  return (
    <nav className="flex items-stretch justify-between gap-2 px-6">
      <div className="flex items-center gap-2">
        <ProgramEditor label="Edit Program" />
        <MemoryWritePopover />
      </div>
      <div className="flex items-stretch gap-4">
        <div className="flex items-stretch gap-4">
          <div className="flex items-center gap-2">
            <Label>Entry</Label>
            <span className="font-mono text-xs tabular-nums">{entryHex}</span>
          </div>
          <Separator orientation="vertical" className="h-[36px]" />
          <div className="flex items-center gap-2">
            <Label>Speed</Label>
            <Slider
              id="delayMs"
              name="delayMs"
              min={0}
              max={vm.speedSteps - 1}
              step={1}
              value={[delay]}
              className="w-30"
              onValueChange={(vals) => {
                const v = Array.isArray(vals) && vals.length ? vals[0]! : 0
                const val = Number.isFinite(v) ? v : 0
                setDelay(val)
                vm.setSpeed(val)
              }}
            />
            <span className="text-xs tabular-nums w-16 text-right">
              {delay === 0 ? '1 instr' : delay === vm.speedSteps - 1 ? 'full' : `×${String(delay)}`}
            </span>
          </div>
        </div>
        <Separator orientation="vertical" />
        <div className="grid grid-cols-3 gap-3">
          <Button
            variant={vm.running ? 'destructive' : 'default'}
            onClick={() => (vm.running ? vm.pause() : vm.run())}
            disabled={!vm.ready}
          >
            {vm.running ? <PauseIcon /> : <PlayIcon />}
            {vm.running ? 'Pause' : 'Run'}
          </Button>
          <Button onClick={() => vm.step(1)} disabled={!vm.ready || vm.running}>
            <StepForwardIcon />
            Step
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // The image is still loaded; reset boots it again.
              vm.reset()
            }}
            disabled={!vm.ready && vm.running}
          >
            <RotateCcwIcon />
            Reset
          </Button>
        </div>
      </div>
    </nav>
  )
}
