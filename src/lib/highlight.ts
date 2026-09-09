/**
 * Colouring source with the published tree-sitter grammars (§4.3).
 *
 * The same grammars the native editors use, loaded through
 * `web-tree-sitter` from the `.wasm` each grammar release carries. The
 * `queries/highlights.scm` shipped beside it is the theme mapping too,
 * so an editor and the lab colour the same token the same way by
 * construction rather than by two tables agreeing.
 *
 * Nothing here is a token table. A hand-written mode would be a second
 * grammar, and it drifts — the failure §11 records for the VM, one
 * layer up.
 */

import { Language, Parser, Query } from "web-tree-sitter";
import runtimeWasm from "web-tree-sitter/web-tree-sitter.wasm?url";

import type { Lang } from "@/worker/protocol";

/** Where the fetch script leaves each grammar's artifacts. */
const GRAMMARS: Record<Lang, { wasm: string; query: string }> = {
  gas: {
    wasm: "/tree-sitter-gero_asm.wasm",
    query: "/tree-sitter-gero_asm.highlights.scm",
  },
  gr: {
    wasm: "/tree-sitter-gero_lang.wasm",
    query: "/tree-sitter-gero_lang.highlights.scm",
  },
};

/**
 * A capture name from `highlights.scm` to the token the Monaco themes
 * paint.
 *
 * The asm-specific names are the ones the gero themes define, so
 * assembly keeps the palette it had. The rest fall on Monaco's own
 * names, which every theme here inherits from `vs`/`vs-dark`.
 */
const TOKENS: Record<string, string> = {
  comment: "comment",
  "keyword.directive": "keyword.directive",
  attribute: "keyword.directive",
  keyword: "keyword.mnemonic",
  "keyword.builtin": "keyword.mnemonic",
  "keyword.conditional": "keyword.mnemonic",
  "keyword.function": "keyword.mnemonic",
  "keyword.operator": "operator",
  "keyword.repeat": "keyword.mnemonic",
  "keyword.return": "keyword.mnemonic",
  "variable.builtin": "variable.register",
  variable: "identifier",
  "variable.parameter": "identifier",
  number: "number.hex",
  "number.float": "number.hex",
  boolean: "number.hex",
  constant: "number.hex",
  "constant.builtin": "number.hex",
  label: "type.label",
  type: "cast.type",
  "type.builtin": "cast.type",
  property: "property",
  operator: "operator",
  "punctuation.bracket": "delimiter",
  "punctuation.delimiter": "delimiter",
  "punctuation.special": "delimiter",
  string: "string",
  "string.escape": "string",
  "string.special": "string",
  character: "string",
  function: "type",
  "function.call": "type",
  "function.method.call": "type",
  constructor: "type",
};

/** One coloured run on a line, in the shape Monaco's tokenizer wants. */
export interface LineToken {
  startIndex: number;
  scopes: string;
}

let initialized: Promise<void> | null = null;
const loaded = new Map<Lang, { parser: Parser; query: Query }>();

/** Bring up the runtime once for the page. */
async function init(): Promise<void> {
  initialized ??= Parser.init({
    // The runtime's own `.wasm`, resolved by the bundler from the file
    // the package exports rather than guessed from the document's URL.
    locateFile: () => runtimeWasm,
  });
  return initialized;
}

/**
 * The parser and highlight query for a language.
 *
 * A grammar that will not load leaves the buffer uncoloured, which is
 * §4.3's own fallback — it is not a reason for the editor not to open.
 */
async function grammarFor(lang: Lang): Promise<{ parser: Parser; query: Query } | null> {
  const already = loaded.get(lang);
  if (already) return already;

  try {
    await init();
    const source = GRAMMARS[lang];
    const [language, scm] = await Promise.all([
      Language.load(source.wasm),
      fetch(source.query).then((r) => {
        if (!r.ok) throw new Error(`${source.query} returned ${String(r.status)}`);
        return r.text();
      }),
    ]);
    const parser = new Parser();
    parser.setLanguage(language);
    const entry = { parser, query: new Query(language, scm) };
    loaded.set(lang, entry);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Tokenize a whole buffer, as a map from line number to its runs.
 *
 * Line-indexed because Monaco asks for one line at a time, and the tree
 * is the only thing that knows where a token began.
 */
export async function highlight(
  text: string,
  lang: Lang,
): Promise<Map<number, LineToken[]>> {
  const lines = new Map<number, LineToken[]>();
  const grammar = await grammarFor(lang);
  if (!grammar) return lines;

  const tree = grammar.parser.parse(text);
  if (!tree) return lines;
  try {
    for (const capture of grammar.query.captures(tree.rootNode)) {
      const token = TOKENS[capture.name];
      if (!token) continue;
      const { startPosition, endPosition } = capture.node;
      // A capture spanning several lines colours each of them from its
      // own edge — Monaco has no notion of a token crossing a line.
      for (let row = startPosition.row; row <= endPosition.row; row++) {
        const runs = lines.get(row) ?? [];
        runs.push({
          startIndex: row === startPosition.row ? startPosition.column : 0,
          scopes: token,
        });
        lines.set(row, runs);
      }
    }
  } finally {
    tree.delete();
  }

  // Monaco reads the runs in order and a later capture is the more
  // specific one, so the last to start at a column wins.
  for (const [row, runs] of lines) {
    const byColumn = new Map<number, string>();
    for (const run of runs) byColumn.set(run.startIndex, run.scopes);
    lines.set(
      row,
      [...byColumn.entries()]
        .map(([startIndex, scopes]) => ({ startIndex, scopes }))
        .toSorted((a, b) => a.startIndex - b.startIndex),
    );
  }
  return lines;
}
