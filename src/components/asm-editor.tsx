/**
 * The source editor.
 *
 * Monaco is the shell the source application used and it stays. What
 * went with the port is everything underneath it: the hand-written
 * Monaco mode, which needed an ISA table this repository must not hold
 * (§11), and the TypeScript language server, which is the second
 * implementation §11 exists to prevent.
 *
 * The three things underneath it now all come from outside:
 *
 * - **Colour** from the published tree-sitter grammars (§4.3), the same
 *   ones the native editors use.
 * - **Diagnostics** from `gero_check` — the CLI's own codes, wording
 *   and spans (§5) — on every edit rather than on every build.
 * - **Formatting** from `gero_format`, so the browser formats what
 *   `gero fmt` formats.
 * - **Position** from the image's line table (§6), which is what turns
 *   the buffer into a debugger view: the line being executed is marked
 *   in it, and a breakpoint is set by clicking the line rather than
 *   hunting for its address in the disassembly.
 */

import { useEffect, useMemo, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { toast } from 'sonner'

import { useProgram } from '@/contexts/program-context'
import { useVM } from '@/contexts/vm-context'
import { useTheme } from '@/components/theme-provider'
import { registerAsmLanguage } from '@/lib/asm-language'
import { highlight, type LineToken } from '@/lib/highlight'
import { installMonacoWorkers } from '@/lib/monaco-setup'
import { addrOfLine, lineAt } from '@/worker/debug'
import type { Diagnostic, Lang } from '@/worker/protocol'

type Props = {
  height?: number | string
  className?: string
  initialValue?: string
}

/** One Monaco language per gero language, so a `.gr` buffer is not
 *  configured as assembly. */
const LANGUAGE_ID: Record<Lang, string> = { gas: 'gero-asm', gr: 'gero-lang' }

const MONACO_THEMES: Record<string, string> = {
  dmg: 'gero-dmg',
  basic: 'gero-basic',
  matrix: 'gero-matrix',
  dark: 'gero-mocha',
}

/** How long a buffer sits still before it is re-coloured and
 *  re-checked. Long enough that typing a word is one pass, short enough
 *  to feel immediate. */
const IDLE_MS = 250

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

interface TokenState extends monaco.languages.IState {
  line: number
}

/**
 * Ask Monaco to tokenize the buffer again.
 *
 * Nothing in the public surface says "the colours moved" — a tokens
 * provider is assumed to be a pure function of the line, and this one
 * reads a map the parser fills in asynchronously. Re-setting the same
 * language is a no-op, so this reaches for the model's own reset.
 */
function retokenize(model: monaco.editor.ITextModel): void {
  const internal = model as unknown as {
    tokenization?: { resetTokenization?: () => void }
  }
  internal.tokenization?.resetTokenization?.()
}

const stateAt = (line: number): TokenState => ({
  line,
  clone: () => stateAt(line),
  equals: (other) => (other as TokenState).line === line,
})

/**
 * The colours of the last parse, per language.
 *
 * Module scope rather than component state: the tokens provider is
 * registered once for the page and keeps whatever it closed over, so a
 * map held by a component would go stale the moment that component
 * remounted — which is what choosing a sample does.
 */
const TOKEN_LINES: Record<Lang, Map<number, LineToken[]>> = {
  gas: new Map(),
  gr: new Map(),
}

/**
 * Register both languages once for the page.
 *
 * Monaco tokenizes one line at a time and does not say which, so the
 * line number rides in the tokenizer state — the contract's own
 * mechanism for carrying something between lines.
 */
function registerLanguages() {
  for (const lang of ['gas', 'gr'] as const) {
    const id = LANGUAGE_ID[lang]
    if (monaco.languages.getLanguages().some((l) => l.id === id)) continue
    monaco.languages.register({ id })
    registerAsmLanguage(id)
    monaco.languages.setTokensProvider(id, {
      getInitialState: () => stateAt(0),
      tokenize: (_line, state) => ({
        tokens: TOKEN_LINES[lang].get((state as TokenState).line) ?? [
          { startIndex: 0, scopes: '' },
        ],
        endState: stateAt((state as TokenState).line + 1),
      }),
    })
  }
}

export function AsmEditor({
  height = 260,
  className = '',
  initialValue = '; Start coding or select a sample program',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const program = useProgram()
  const vm = useVM()
  const { theme } = useTheme()
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const marksRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(
    null
  )
  const suppressSetRef = useRef(false)

  const openName = program.openName
  const lang = program.lang
  const text = program.getSource()
  const debug = program.debug
  const languageId = LANGUAGE_ID[lang]
  const uri = useMemo(
    () => monaco.Uri.parse(`inmemory://gero/${openName}`),
    [openName]
  )

  /**
   * Toggle the breakpoint a source line stands for.
   *
   * Read through a ref because the editor is created once per opening
   * and the tables it consults are replaced by every build.
   */
  const toggleAtLine = useRef<(line: number) => void>(() => undefined)
  const { toggleBreakpoint } = vm
  useEffect(() => {
    toggleAtLine.current = (line) => {
      if (!debug.present) {
        toast.info('this image carries no debug information', {
          description: 'set breakpoints on the disassembly instead',
        })
        return
      }
      const addr = addrOfLine(debug, openName, line)
      if (addr === null) {
        toast.info(`line ${String(line)} produced no code`)
        return
      }
      toggleBreakpoint(addr)
    }
  }, [debug, openName, toggleBreakpoint])

  // Formatting is the module's, so Monaco's own format command and any
  // control that asks for it reach the same place.
  const { format, getSource } = program
  useEffect(() => {
    const registrations = (['gas', 'gr'] as const).map((l) =>
      monaco.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID[l], {
        provideDocumentFormattingEdits: async (model) => {
          const changed = await format()
          // A buffer that does not parse formats to nothing, and is
          // left as it is rather than rewritten from a partial tree.
          if (!changed) return []
          return [{ range: model.getFullModelRange(), text: getSource() }]
        },
      })
    )
    return () => {
      for (const r of registrations) r.dispose()
    }
  }, [format, getSource])

  useEffect(() => {
    installMonacoWorkers()
    if (!containerRef.current) return

    registerLanguages()

    // Reuse an existing model so edits survive the sheet closing.
    const existing = monaco.editor.getModel(uri)
    const seed = text || initialValue
    const model = existing ?? monaco.editor.createModel(seed, languageId, uri)
    modelRef.current = model
    if (existing) {
      monaco.editor.setModelLanguage(existing, languageId)
      if (seed !== existing.getValue()) {
        suppressSetRef.current = true
        try {
          existing.setValue(seed)
        } finally {
          suppressSetRef.current = false
        }
      }
    }

    const editor = monaco.editor.create(containerRef.current, {
      model,
      minimap: { enabled: false },
      automaticLayout: true,
      // Where a breakpoint is set, and where the current line is marked.
      glyphMargin: true,
      theme: MONACO_THEMES[theme] ?? 'gero-latte',
      fontSize: 16,
      lineHeight: 24,
      fontFamily: "'JetBrains Mono', monospace",
      wordWrap: 'wordWrapColumn',
      wordWrapColumn: 80,
      wrappingIndent: 'same',
      rulers: [80],
    })

    editorRef.current = editor
    marksRef.current = editor.createDecorationsCollection()

    const sub = model.onDidChangeContent(() => {
      if (suppressSetRef.current) return
      program.setSource(model.getValue())
    })

    const clicks = editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        return
      }
      const line = e.target.position?.lineNumber
      if (line !== undefined) toggleAtLine.current(line)
    })

    return () => {
      editor.dispose()
      sub.dispose()
      clicks.dispose()
      editorRef.current = null
      marksRef.current = null
      // The model is kept so content survives a sheet toggle.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, languageId, initialValue, theme, program.setSource])

  /**
   * The line being executed, and the lines holding breakpoints.
   *
   * Both come from the line table, and both are filtered to the open
   * file — a program built from several files has addresses in all of
   * them, and line 12 of one is not line 12 of another.
   */
  const ip = vm.snap?.ip ?? null
  const breakpoints = vm.breakpoints
  /** The line last scrolled to, so a breakpoint change does not move a
   *  view the user is reading. */
  const revealed = useRef<number | null>(null)
  useEffect(() => {
    const marks = marksRef.current
    const model = modelRef.current
    if (!marks || !model) return

    const lineOf = (addr: number): number | null => {
      const row = lineAt(debug, addr)
      return row && row.file === openName ? row.line : null
    }
    const inRange = (line: number) => line >= 1 && line <= model.getLineCount()

    const decorations: monaco.editor.IModelDeltaDecoration[] = []
    for (const addr of breakpoints) {
      const line = lineOf(addr)
      if (line === null || !inRange(line)) continue
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'gero-breakpoint-line',
          glyphMarginClassName: 'gero-breakpoint-glyph',
          glyphMarginHoverMessage: { value: `breakpoint at $${addr.toString(16).padStart(4, '0').toUpperCase()}` },
        },
      })
    }

    const current = ip === null ? null : lineOf(ip)
    if (current !== null && inRange(current)) {
      decorations.push({
        range: new monaco.Range(current, 1, current, 1),
        options: {
          isWholeLine: true,
          className: 'gero-current-line',
          glyphMarginClassName: 'gero-current-glyph',
        },
      })
      if (revealed.current !== current) {
        editorRef.current?.revealLineInCenterIfOutsideViewport(current)
        revealed.current = current
      }
    }

    marks.set(decorations)
  }, [debug, openName, breakpoints, ip])

  // Colour and diagnostics both follow the buffer, on the same idle.
  const { check } = program
  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    let live = true
    const timer = setTimeout(() => {
      void highlight(text, lang).then((lines) => {
        if (!live) return
        TOKEN_LINES[lang] = lines
        retokenize(model)
      })
      void check().then((found) => {
        if (!live) return
        monaco.editor.setModelMarkers(
          model,
          'gero',
          found.filter((d) => d.file === openName).map(toMarker)
        )
      })
    }, IDLE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [text, lang, openName, check])

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
  }, [text, initialValue])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  )
}
