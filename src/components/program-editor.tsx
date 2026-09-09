import { useEffect, useState } from 'react'
import { AsmEditor } from './asm-editor'
import { useProgram } from '@/contexts/program-context'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet'
import { Button } from './ui/button'
import { CodeIcon } from 'lucide-react'
import { loadSamples, type Sample } from '@/samples'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

type ProgramEditorProps = {
  label?: string
}

export function ProgramEditor({ label }: ProgramEditorProps) {
  const [open, setOpen] = useState(false)
  const program = useProgram()
  const [selected, setSelected] = useState<string>('')
  const [editorKey, setEditorKey] = useState(0) // to force remount editor
  const [samples, setSamples] = useState<Sample[]>([])

  // The set ships beside the module and is fetched, not vendored (§9).
  useEffect(() => {
    loadSamples()
      .then(setSamples)
      .catch(() => setSamples([]))
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline">
          <CodeIcon />
          {label ?? 'Load Program'}
        </Button>} />
      <SheetContent
        side="left"
        className="w-1/2 h-full flex flex-col gap-4 bg-background"
      >
        <div className="px-4 pt-4">
          <SheetHeader>
            <SheetTitle>Program Editor</SheetTitle>
            <SheetDescription>
              Write your assembly program here. The editor supports syntax
              highlighting, code completion, and error reporting.
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="flex items-center gap-3 px-6">
          <div className="flex items-center gap-2 text-sm">
            <Select
              value={selected}
              onValueChange={(v) => {
                const name = String(v ?? '')
                setSelected(name)
                const s = samples.find((x) => x.name === name)
                if (s) {
                  program.setProgram(s.files, s.entry, s.lang)
                  setEditorKey((k) => k + 1)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select sample program" />
              </SelectTrigger>
              <SelectContent>
                {samples.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Sample loads on selection; no separate button needed */}
          </div>
          <Button
            disabled={program.building}
            onClick={() => {
              // A successful build loads itself in the worker, so the
              // sheet closes on a clean one and stays open on errors —
              // which the diagnostics pane is showing.
              void program.build().then((res) => {
                if (res.image.length > 0) setOpen(false)
              })
            }}
          >
            {program.building ? 'Building…' : 'Assemble & Load'}
          </Button>
        </div>
        <div className="flex-1 min-h-0 pr-6 pt-4 pb-6">
          {open && (
            <AsmEditor
              key={editorKey}
              height={'100%'}
              className="w-full h-full bg-gray-900 rounded"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
