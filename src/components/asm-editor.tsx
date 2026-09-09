/**
 * The source editor.
 *
 * Monaco is the shell the source application used and it stays. What
 * went with the port is everything underneath it: the hand-written
 * Monaco mode, which needs an ISA table this repository must not hold
 * (§11), and the TypeScript language server, which is the second
 * implementation §11 exists to prevent.
 *
 * Diagnostics come from the module instead — the same `gero check`
 * path, so the wording, the codes and the spans are the CLI's (§5).
 * Colour comes from the published tree-sitter grammar; until that lands
 * the buffer is uncoloured, which is what §4.3 says the fallback is.
 */

import { useEffect, useMemo, useRef } from 'react'
import * as monaco from 'monaco-editor'

import { registerAsmLanguage } from '@/lib/asm-language'
import { installMonacoWorkers } from '@/lib/monaco-setup'
import { useProgram } from '@/contexts/program-context'
import { useTheme } from '@/components/theme-provider'
import type { Diagnostic } from '@/worker/protocol'

type Props = {
  height?: number | string
  className?: string
  initialValue?: string
}

const LANGUAGE_ID = 'gero-asm'

const MONACO_THEMES: Record<string, string> = {
  dmg: 'gero-dmg',
  basic: 'gero-basic',
  matrix: 'gero-matrix',
  dark: 'gero-mocha',
}

/** A module diagnostic as a Monaco marker. Asm reports a point rather
 *  than a span, so a marker for one covers the rest of the line. */
function toMarker(d: Diagnostic): monaco.editor.IMarkerData {
  return {
    severity:
      d.severity === 'error'
        ? monaco.MarkerSeverity.Error
        : d.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
    message: d.note ? `${d.message}\n${d.note}` : d.message,
    code: d.code,
    startLineNumber: d.line,
    startColumn: d.column,
    endLineNumber: d.end_line ?? d.line,
    endColumn: d.end_col ?? Number.MAX_SAFE_INTEGER,
  }
}

export function AsmEditor({
  height = 260,
  className = '',
  initialValue = '; Start coding or select a sample program',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const program = useProgram()
  // One model per file, which is what Monaco expects and what a
  // multi-file program needs: switching files switches models rather
  // than rewriting one buffer's contents underneath the editor.
  const openName = program.openName
  const text = program.getSource()
  const uri = useMemo(
    () => monaco.Uri.parse(`inmemory://gero/${openName}`),
    [openName]
  )
  const { theme } = useTheme()
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const suppressSetRef = useRef(false)

  useEffect(() => {
    installMonacoWorkers()
    if (!containerRef.current) return

    monaco.languages.register({ id: LANGUAGE_ID })
    registerAsmLanguage(LANGUAGE_ID)

    // Reuse an existing model so edits survive the sheet closing.
    const existing = monaco.editor.getModel(uri)
    const seed = text || initialValue
    const model = existing ?? monaco.editor.createModel(seed, LANGUAGE_ID, uri)
    modelRef.current = model
    if (existing && seed !== model.getValue()) {
      suppressSetRef.current = true
      try {
        model.setValue(seed)
      } finally {
        suppressSetRef.current = false
      }
    }

    const editor = monaco.editor.create(containerRef.current, {
      model,
      minimap: { enabled: false },
      automaticLayout: true,
      theme: MONACO_THEMES[theme] ?? 'gero-latte',
      fontSize: 16,
      lineHeight: 24,
      fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', monospace",
      wordWrap: 'wordWrapColumn',
      wordWrapColumn: 80,
      wrappingIndent: 'same',
      rulers: [80],
    })

    // Deliberately no write-back of the seed: the model was seeded from
    // the program, and pushing it back would overwrite a restored
    // working set with this editor's placeholder if it mounted first.
    const sub = model.onDidChangeContent(() => {
      if (suppressSetRef.current) return
      program.setSource(model.getValue())
    })

    return () => {
      editor.dispose()
      sub.dispose()
      // The model is kept so content survives a sheet toggle.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, initialValue, theme])

  // The build's diagnostics become the editor's markers, so a squiggle
  // and the diagnostics pane always say the same thing.
  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    const mine = (program.lastBuild?.diagnostics ?? []).filter(
      (d) => d.file === program.openName
    )
    monaco.editor.setModelMarkers(model, 'gero', mine.map(toMarker))
  }, [program.lastBuild, program.openName])

  // The program's text is the source of truth; the model follows it.
  useEffect(() => {
    const m = modelRef.current
    if (!m) return
    const src = text || initialValue
    if (src !== m.getValue()) {
      suppressSetRef.current = true
      try {
        m.setValue(src)
      } finally {
        suppressSetRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, initialValue])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  )
}
