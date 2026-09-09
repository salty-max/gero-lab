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
import { HexInput } from './ui/hex-input'
import { Label } from './ui/label'
import { Separator } from './ui/separator'
import { Slider } from './ui/slider'
import { useProgram } from '@/contexts/program-context'
import { useVM } from '@/contexts/vm-context'
import { useState } from 'react'

export function ToolBar() {
  const program = useProgram()
  const vm = useVM()
  const [delay, setDelay] = useState(500)
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
            <Label>Start @</Label>
            <HexInput
              name="startIp"
              value={entryHex}
              onEnter={(s) => {
                const v = parseInt(s, 16)
                if (!Number.isNaN(v)) {
                  program.setEntry(u16(v))
                }
              }}
            />
          </div>
          <Separator orientation="vertical" className="h-[36px]" />
          <div className="flex items-center gap-2">
            <Label>Delay (ms)</Label>
            <Slider
              id="delayMs"
              name="delayMs"
              min={0}
              max={3000}
              step={50}
              value={[delay]}
              className="w-30"
              onValueChange={(vals) => {
                const v = Array.isArray(vals) && vals.length ? vals[0]! : 0
                const val = Number.isFinite(v) ? v : 0
                setDelay(val)
                vm.setStepDelay(val)
              }}
            />
            <span className="text-xs tabular-nums w-8 text-right">{delay}</span>
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
              vm.reset()
              // Reload last program (if any) at previous base and entry
              // The image is still loaded; reset boots it again.
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
