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
 */

import { useEffect, useMemo, useRef } from 'react'
import * as monaco from 'monaco-editor'

import { useProgram } from '@/contexts/program-context'
import { useTheme } from '@/components/theme-provider'
import { registerAsmLanguage } from '@/lib/asm-language'
import { highlight, type LineToken } from '@/lib/highlight'
import { installMonacoWorkers } from '@/lib/monaco-setup'
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
 * Register both languages once for the page.
 *
 * The tokens provider reads the map the tree-sitter pass fills in.
 * Monaco tokenizes one line at a time and does not say which, so the
 * line number rides in the tokenizer state — the contract's own
 * mechanism for carrying something between lines.
 */
function registerLanguages(tokensOf: (lang: Lang) => Map<number, LineToken[]>) {
  for (const lang of ['gas', 'gr'] as const) {
    const id = LANGUAGE_ID[lang]
    if (monaco.languages.getLanguages().some((l) => l.id === id)) continue
    monaco.languages.register({ id })
    registerAsmLanguage(id)
    monaco.languages.setTokensProvider(id, {
      getInitialState: () => stateAt(0),
      tokenize: (_line, state) => ({
        tokens: tokensOf(lang).get((state as TokenState).line) ?? [
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
  const { theme } = useTheme()
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const suppressSetRef = useRef(false)
  /** The colours of the last parse, per language, read by the tokens
   *  provider Monaco calls back into. */
  const tokens = useRef<Record<Lang, Map<number, LineToken[]>>>({
    gas: new Map(),
    gr: new Map(),
  })

  const openName = program.openName
  const lang = program.lang
  const text = program.getSource()
  const languageId = LANGUAGE_ID[lang]
  const uri = useMemo(
    () => monaco.Uri.parse(`inmemory://gero/${openName}`),
    [openName]
  )

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

    registerLanguages((l) => tokens.current[l])

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
      theme: MONACO_THEMES[theme] ?? 'gero-latte',
      fontSize: 16,
      lineHeight: 24,
      fontFamily: "'JetBrains Mono', monospace",
      wordWrap: 'wordWrapColumn',
      wordWrapColumn: 80,
      wrappingIndent: 'same',
      rulers: [80],
    })

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
  }, [uri, languageId, initialValue, theme, program.setSource])

  // Colour and diagnostics both follow the buffer, on the same idle.
  const { check } = program
  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    let live = true
    const timer = setTimeout(() => {
      void highlight(text, lang).then((lines) => {
        if (!live) return
        tokens.current[lang] = lines
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
