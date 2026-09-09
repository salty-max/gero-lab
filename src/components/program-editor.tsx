import { useEffect, useState } from 'react'
import { AsmEditor } from './asm-editor'
import { useProgram } from '@/contexts/program-context'
import { useVM } from '@/contexts/vm-context'
import { lineAt } from '@/worker/debug'
import { fmt16 } from '@/lib/format'
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

/**
 * Where the program is stopped, in source terms (§6).
 *
 * Says which file as well as which line, because a marked line in the
 * open buffer is only the whole story for a single-file program — and
 * it names the address when no line owns it, so an image without a
 * debug section reads as lacking one rather than as broken.
 */
function SourcePosition() {
  const vm = useVM()
  const { debug, openName } = useProgram()
  const ip = vm.snap?.ip
  if (ip === undefined) return null

  const row = lineAt(debug, ip)
  if (!row) {
    return (
      <span className="text-xs text-muted-foreground">
        at {fmt16(ip)}
        {debug.present ? ' — no source line' : ' — no debug information'}
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground">
      at <span className="text-gero">{row.file}:{String(row.line)}</span>
      {row.file === openName ? '' : ' — not the open file'}
    </span>
  )
}

export function ProgramEditor({ label }: ProgramEditorProps) {
  const [open, setOpen] = useState(false)
  const program = useProgram()
  const [selected, setSelected] = useState<string>('')
  const [editorKey, setEditorKey] = useState(0) // to force remount editor
  const [samples, setSamples] = useState<Sample[]>([])

  // Drawn from gero's examples and published beside the module (§9).
  useEffect(() => {
    loadSamples()
      .then(setSamples)
      .catch(() => setSamples([]))
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <CodeIcon />
          {label ?? 'Load Program'}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        overlay={false}
        // Source-level stepping is the editor and the toolbar used
        // together: the run controls have to stay live and clicking one
        // must not dismiss the source it is stepping through. Escape
        // and the close button remain.
        onInteractOutside={(e) => {
          e.preventDefault()
        }}
        className="w-1/2 h-full flex flex-col gap-4 bg-background"
      >
        <div className="px-4 pt-4">
          <SheetHeader>
            <SheetTitle>Program Editor</SheetTitle>
            <SheetDescription>
              Write your program here. Errors are reported as you type, and
              the gutter sets a breakpoint on the line you click.
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="flex items-center gap-3 px-6">
          <div className="flex items-center gap-2 text-sm">
            <Select
              value={selected}
              onValueChange={(v) => {
                setSelected(v)
                const s = samples.find((x) => x.name === v)
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
              // drawer closes on a clean one and stays open on errors,
              // which the editor's markers are showing.
              void program.build().then((res) => {
                if (res.image.length > 0) setOpen(false)
              })
            }}
          >
            {program.building ? 'Building…' : 'Assemble & Load'}
          </Button>
          <SourcePosition />
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
