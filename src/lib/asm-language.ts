import * as monaco from 'monaco-editor'

/**
 * Editor configuration for the asm language: comments, brackets, and
 * the themes the cockpit switches between.
 *
 * Deliberately no tokenizer. A Monaco mode is a hand-written grammar,
 * and the source application's was fed an ISA table from
 * `@gero/asm-lsp` — §4.3 and §11 both rule that out. Colour comes from
 * the published tree-sitter grammar; until then the buffer is
 * uncoloured, which is the spec's own fallback.
 */
export function registerAsmLanguage(langId: string): void {
  monaco.languages.setLanguageConfiguration(langId, {
    comments: { lineComment: ';' },
    brackets: [
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  })

  monaco.editor.defineTheme('gero-mocha', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', background: '0E0E0E', foreground: 'CDD6F4' }, // base text
      { token: 'comment', foreground: '6C7086', fontStyle: 'italic' },
      { token: 'keyword.directive', foreground: 'F5C2E7', fontStyle: 'bold' },
      { token: 'keyword.export', foreground: 'F38BA8', fontStyle: 'bold' },
      { token: 'keyword.mnemonic', foreground: '89B4FA', fontStyle: 'bold' },
      { token: 'variable.register', foreground: '94E2D5', fontStyle: 'bold' },
      { token: 'number.hex', foreground: 'FAB387' },
      { token: 'address.literal', foreground: 'F9E2AF' },
      { token: 'address.delim', foreground: 'CBA6F7' },
      { token: 'cast.type', foreground: 'A6E3A1', fontStyle: 'bold' },
      { token: 'cast.delim', foreground: 'CBA6F7' },
      { token: 'property', foreground: 'F2CDCD' },
      { token: 'type.label', foreground: 'F5E0DC', fontStyle: 'bold' },
      { token: 'identifier', foreground: 'CDD6F4' },
      { token: 'operator', foreground: 'F5C2E7' },
      { token: 'delimiter', foreground: '89DCEB' },
    ],
    colors: {
      'editor.background': '#0A0A0A',
      'editor.foreground': '#CDD6F4',
      'editor.lineHighlightBackground': '#1E1E2E',
      'editorCursor.foreground': '#F38BA8',
      'editorLineNumber.foreground': '#6C7086',
      'editorLineNumber.activeForeground': '#BAC2DE',
      'editor.selectionBackground': '#45475A',
      'editor.inactiveSelectionBackground': '#313244',
    },
  })

  monaco.editor.defineTheme('gero-lab', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'E6E6E6', background: '0E0E0E' }, // default text
      { token: 'comment', foreground: '555555', fontStyle: 'italic' },
      { token: 'keyword.directive', foreground: 'FF5555', fontStyle: 'bold' }, // matches UI red
      { token: 'keyword.export', foreground: 'FF5555', fontStyle: 'bold' },
      { token: 'keyword.mnemonic', foreground: 'FF7B72', fontStyle: 'bold' }, // softer red/orange for opcodes
      { token: 'variable.register', foreground: '5DE6D1', fontStyle: 'bold' }, // teal
      { token: 'number.hex', foreground: 'FFD966' }, // amber/yellow for numbers
      { token: 'address.literal', foreground: 'FFA07A' }, // light salmon
      { token: 'address.delim', foreground: 'C678DD' }, // purple for &
      { token: 'cast.type', foreground: '98C379', fontStyle: 'bold' }, // green for struct names
      { token: 'cast.delim', foreground: 'C678DD' }, // purple <>
      { token: 'property', foreground: 'E6E6E6' }, // keep neutral
      { token: 'type.label', foreground: 'FF5555', fontStyle: 'bold' },
      { token: 'identifier', foreground: 'E6E6E6' },
      { token: 'operator', foreground: 'FF7B72' },
      { token: 'delimiter', foreground: 'AAAAAA' },
    ],
    colors: {
      'editor.background': '#0E0E0E', // pure black, same as UI
      'editor.foreground': '#E6E6E6',
      'editor.lineHighlightBackground': '#161616',
      'editorCursor.foreground': '#FF5555', // red cursor
      'editorLineNumber.foreground': '#555555',
      'editorLineNumber.activeForeground': '#E6E6E6',
      'editor.selectionBackground': '#222222',
      'editor.inactiveSelectionBackground': '#1A1A1A',
    },
  })

  // Catppuccin Latte inspired light theme
  monaco.editor.defineTheme('gero-latte', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', background: 'EFF1F5', foreground: '4C4F69' }, // base text
      { token: 'comment', foreground: '7C7F93', fontStyle: 'italic' }, // overlay1
      { token: 'keyword.directive', foreground: 'EA76CB', fontStyle: 'bold' }, // pink
      { token: 'keyword.export', foreground: 'D20F39', fontStyle: 'bold' }, // red
      { token: 'keyword.mnemonic', foreground: '1E66F5', fontStyle: 'bold' }, // blue
      { token: 'variable.register', foreground: '179299', fontStyle: 'bold' }, // teal
      { token: 'number.hex', foreground: 'FE640B' }, // peach
      { token: 'address.literal', foreground: 'DF8E1D' }, // yellow
      { token: 'address.delim', foreground: '8839EF' }, // mauve
      { token: 'cast.type', foreground: '40A02B', fontStyle: 'bold' }, // green
      { token: 'cast.delim', foreground: '8839EF' }, // mauve
      { token: 'property', foreground: '4C4F69' },
      { token: 'type.label', foreground: 'EA76CB', fontStyle: 'bold' }, // pink
      { token: 'identifier', foreground: '4C4F69' },
      { token: 'operator', foreground: 'DD7878' }, // maroon
      { token: 'delimiter', foreground: '7C7F93' }, // overlay1
    ],
    colors: {
      'editor.background': '#EFF1F5', // latte base
      'editor.foreground': '#4C4F69',
      'editor.lineHighlightBackground': '#CCD0DA',
      'editorCursor.foreground': '#D20F39', // red cursor
      'editorLineNumber.foreground': '#9CA0B0', // overlay2
      'editorLineNumber.activeForeground': '#4C4F69',
      'editor.selectionBackground': '#ACB0BE80',
      'editor.inactiveSelectionBackground': '#ACB0BE55',
    },
  })

  // Game Boy DMG inspired light theme
  monaco.editor.defineTheme('gero-dmg', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', background: '9BBC0F', foreground: '0F380F' },
      { token: 'comment', foreground: '306230', fontStyle: 'italic' },
      { token: 'keyword.directive', foreground: '0F380F', fontStyle: 'bold' },
      { token: 'keyword.export', foreground: '0F380F', fontStyle: 'bold' },
      { token: 'keyword.mnemonic', foreground: '0F380F', fontStyle: 'bold' },
      { token: 'variable.register', foreground: '306230', fontStyle: 'bold' },
      { token: 'number.hex', foreground: '0F380F' },
      { token: 'address.literal', foreground: '0F380F' },
      { token: 'address.delim', foreground: '306230' },
      { token: 'delimiter.parenthesis', foreground: '306230' },
      { token: 'delimiter.square', foreground: '306230' },
      { token: 'cast.type', foreground: '0F380F', fontStyle: 'bold' },
      { token: 'cast.delim', foreground: '306230' },
      { token: 'property', foreground: '0F380F' },
      { token: 'type.label', foreground: '0F380F', fontStyle: 'bold' },
      { token: 'identifier', foreground: '0F380F' },
      { token: 'operator', foreground: '306230' },
      { token: 'delimiter', foreground: '306230' },
    ],
    colors: {
      'editor.background': '#9BBC0F',
      'editor.foreground': '#0F380F',
      'editor.lineHighlightBackground': '#8BAC0F80',
      'editorCursor.foreground': '#0F380F',
      'editorLineNumber.foreground': '#306230',
      'editorLineNumber.activeForeground': '#0F380F',
      'editor.selectionBackground': '#8BAC0F80',
      'editor.inactiveSelectionBackground': '#8BAC0F55',
      // Ensure bracket matches and pair colorization are green (not blue)
      'editorBracketMatch.background': '#8BAC0F80',
      'editorBracketMatch.border': '#0F380F',
      'editorBracketHighlight.foreground1': '#0F380F',
      'editorBracketHighlight.foreground2': '#0F380F',
      'editorBracketHighlight.foreground3': '#0F380F',
      'editorBracketHighlight.foreground4': '#0F380F',
      'editorBracketHighlight.foreground5': '#0F380F',
      'editorBracketHighlight.foreground6': '#0F380F',
    },
  })

  // BASIC (C64-ish) inspired blue screen theme
  monaco.editor.defineTheme('gero-basic', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', background: '1E1E8C', foreground: 'A8C4FF' },
      { token: 'comment', foreground: '6C5EB5', fontStyle: 'italic' },
      { token: 'keyword.directive', foreground: 'A8C4FF', fontStyle: 'bold' },
      { token: 'keyword.export', foreground: 'A8C4FF', fontStyle: 'bold' },
      { token: 'keyword.mnemonic', foreground: 'A8C4FF', fontStyle: 'bold' },
      { token: 'variable.register', foreground: '6C8BFF', fontStyle: 'bold' },
      { token: 'number.hex', foreground: 'FFD700' },
      { token: 'address.literal', foreground: 'FFD700' },
      { token: 'address.delim', foreground: '6C8BFF' },
      { token: 'delimiter.parenthesis', foreground: '6C8BFF' },
      { token: 'delimiter.square', foreground: '6C8BFF' },
      { token: 'cast.type', foreground: 'A8C4FF', fontStyle: 'bold' },
      { token: 'cast.delim', foreground: '6C8BFF' },
      { token: 'property', foreground: 'A8C4FF' },
      { token: 'type.label', foreground: 'A8C4FF', fontStyle: 'bold' },
      { token: 'identifier', foreground: 'A8C4FF' },
      { token: 'operator', foreground: '6C8BFF' },
      { token: 'delimiter', foreground: '6C8BFF' },
    ],
    colors: {
      'editor.background': '#1E1E8C',
      'editor.foreground': '#A8C4FF',
      'editor.lineHighlightBackground': '#2A2AA0',
      'editorCursor.foreground': '#FFD700',
      'editorLineNumber.foreground': '#6C5EB5',
      'editorLineNumber.activeForeground': '#A8C4FF',
      'editor.selectionBackground': '#3A3AB580',
      'editor.inactiveSelectionBackground': '#3A3AB555',
      'editorBracketMatch.background': '#3A3AB550',
      'editorBracketMatch.border': '#A8C4FF',
    },
  })

  // MATRIX (dark + neon green) theme
  monaco.editor.defineTheme('gero-matrix', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', background: '050805', foreground: 'B6FFB6' },
      { token: 'comment', foreground: '0F3D0F', fontStyle: 'italic' },
      { token: 'keyword.directive', foreground: '00FF66', fontStyle: 'bold' },
      { token: 'keyword.export', foreground: '00FF66', fontStyle: 'bold' },
      { token: 'keyword.mnemonic', foreground: '00FF66', fontStyle: 'bold' },
      { token: 'variable.register', foreground: '7CFF9C', fontStyle: 'bold' },
      { token: 'number.hex', foreground: '7CFF9C' },
      { token: 'address.literal', foreground: '7CFF9C' },
      { token: 'address.delim', foreground: '00FF66' },
      { token: 'delimiter.parenthesis', foreground: '00FF66' },
      { token: 'delimiter.square', foreground: '00FF66' },
      { token: 'cast.type', foreground: 'B6FFB6', fontStyle: 'bold' },
      { token: 'cast.delim', foreground: '00FF66' },
      { token: 'property', foreground: 'B6FFB6' },
      { token: 'type.label', foreground: '00FF66', fontStyle: 'bold' },
      { token: 'identifier', foreground: 'B6FFB6' },
      { token: 'operator', foreground: '7CFF9C' },
      { token: 'delimiter', foreground: '00FF66' },
    ],
    colors: {
      'editor.background': '#050805',
      'editor.foreground': '#B6FFB6',
      'editor.lineHighlightBackground': '#0A150A',
      'editorCursor.foreground': '#00FF66',
      'editorLineNumber.foreground': '#0F3D0F',
      'editorLineNumber.activeForeground': '#B6FFB6',
      'editor.selectionBackground': '#0F3D0F80',
      'editor.inactiveSelectionBackground': '#0F3D0F55',
      'editorBracketMatch.background': '#0F3D0F55',
      'editorBracketMatch.border': '#00FF66',
    },
  })
}
