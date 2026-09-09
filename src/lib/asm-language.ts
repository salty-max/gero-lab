import * as monaco from 'monaco-editor'


/**
 * Editor configuration for the asm language: comments, brackets, and
 * the themes the cockpit switches between.
 *
 * Deliberately no tokenizer. A Monaco mode is a hand-written grammar,
 * and it needs an ISA table this repository must not hold — §4.3 and
 * §11 both rule it out. Colour comes from the published tree-sitter
 * grammar instead; until that lands the buffer is uncoloured, which is
 * the spec's own fallback.
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
}

