/**
 * The file set, as a strip of tabs (gero-lab.md §4.2).
 *
 * A session holds a named set of buffers, not a string: `include` and
 * `use` resolve against it, and a build sees all of them. So every one
 * of them has to be reachable — a three-file sample whose entry is the
 * only editable buffer is a program you cannot read, let alone change.
 *
 * The set is also what `gero check` validates, entry-reachable or not,
 * so a file's errors are counted on its tab. A buffer that does not
 * compile is visible without opening it.
 */

import { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'

import { useProgram } from '@/contexts/program-context'
import { cn } from '@/lib/utils'
import type { Lang } from '@/worker/protocol'

/** The extension a new buffer takes when its name gives none, so a
 *  file the user names `math` resolves the way `use math` expects. */
const EXTENSION: Record<Lang, string> = { gas: '.gas', gr: '.gr' }

/** A name with no extension takes the set's own; anything a path could
 *  escape through is refused, matching §4.2's closed resolution. */
export function normalizeName(raw: string, lang: Lang): string | null {
  const name = raw.trim()
  if (name.length === 0 || name.includes('/') || name.includes('\\')) return null
  if (name === '.' || name === '..') return null
  return name.includes('.') ? name : name + EXTENSION[lang]
}

export function FileTabs() {
  const program = useProgram()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const errorsIn = (name: string) =>
    program.diagnostics.filter(
      (d) => d.file === name && d.severity === 'error'
    ).length

  const commit = () => {
    const name = normalizeName(draft, program.lang)
    if (name) program.addFile(name)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-6">
      {program.files.map((file) => {
        const open = file.name === program.openName
        const entry = file.name === program.entryName
        const errors = errorsIn(file.name)
        return (
          <div
            key={file.name}
            className={cn(
              'group flex shrink-0 items-center gap-1.5 rounded-t border-b-2 px-2 py-1 text-xs',
              open
                ? 'border-gero bg-secondary text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-secondary/50'
            )}
          >
            <button
              type="button"
              onClick={() => {
                program.openFile(file.name)
              }}
              className="cursor-pointer"
            >
              {file.name}
            </button>

            {entry && (
              <span
                className="text-gero"
                title="the file the program starts from"
              >
                ▸
              </span>
            )}

            {errors > 0 && (
              <span
                className="rounded bg-destructive/80 px-1 text-[10px] text-white tabular-nums"
                title={`${String(errors)} error${errors === 1 ? '' : 's'}`}
              >
                {errors}
              </span>
            )}

            {!entry && (
              <button
                type="button"
                aria-label={`remove ${file.name}`}
                onClick={() => {
                  program.removeFile(file.name)
                }}
                className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        )
      })}

      {adding ? (
        <input
          // The field appears because the user asked for it, so it
          // takes the caret rather than making them click it too.
          ref={(el) => {
            el?.focus()
          }}
          value={draft}
          placeholder={`name${EXTENSION[program.lang]}`}
          onChange={(e) => {
            setDraft(e.currentTarget.value)
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          className="h-6 w-32 shrink-0 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button
          type="button"
          aria-label="add a file"
          onClick={() => {
            setAdding(true)
          }}
          className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <PlusIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}
