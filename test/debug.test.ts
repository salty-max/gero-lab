import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

import { addrOfLine, lineAt, parseDebugInfo, symbolAt } from "../src/worker/debug.js";
import { GeroModule } from "../src/worker/module.js";

/** The tables the module actually emits, for the sample the panes were
 *  built against. Reading them from the module rather than from a
 *  fixture is what keeps this honest — a hand-written fixture agrees
 *  with whatever its author believed the schema was. */
async function debugFor(source: string) {
  const mod = await GeroModule.instantiate(await readFile("public/gero.wasm"));
  mod.putFiles([{ name: "main.gr", text: source }]);
  const r = mod.build("main.gr", "gr");
  expect(r.payload).not.toBeNull();
  return { info: parseDebugInfo(mod.debugInfo(r.payload!)), image: r.payload! };
}

const PROGRAM = [
  "def main()",
  "  let total = 0",
  "  for i in 1..4",
  "    total = total + i",
  "  end",
  "  print total",
  "end",
  "",
].join("\n");

test("parseDebugInfo: resolves the tables the module emits", async () => {
  const { info } = await debugFor(PROGRAM);
  expect(info.present).toBe(true);
  expect(info.symbols.length).toBeGreaterThan(0);
  expect(info.lines.length).toBeGreaterThan(0);

  // A row names its file by index into the manifest's list; unresolved,
  // every source-level feature silently goes dead.
  for (const row of info.lines) {
    expect(row.file).toBe("main.gr");
    expect(Number.isFinite(row.start)).toBe(true);
    expect(row.end).toBeGreaterThan(row.start);
  }
  for (const symbol of info.symbols) {
    expect(Number.isFinite(symbol.addr)).toBe(true);
    expect(symbol.name.length).toBeGreaterThan(0);
  }
});

test("addrOfLine: a line that produced code maps to its first address", async () => {
  const { info } = await debugFor(PROGRAM);
  const addr = addrOfLine(info, "main.gr", 2);
  expect(addr).not.toBeNull();

  // Round-tripping is the property the gutter depends on: clicking a
  // line sets a breakpoint whose hit highlights that same line.
  expect(lineAt(info, addr!)?.line).toBe(2);
});

test("addrOfLine: a line that produced no code has no address", async () => {
  const { info } = await debugFor(PROGRAM);
  // Line 8 is past the end; the gutter must stay inert rather than
  // pretending a breakpoint was set.
  expect(addrOfLine(info, "main.gr", 8)).toBeNull();
  expect(addrOfLine(info, "other.gr", 2)).toBeNull();
});

test("lineAt: the narrowest covering range wins", () => {
  const info = parseDebugInfo(
    JSON.stringify({
      symbols: [],
      files: ["main.gr"],
      lines: [
        { start: 0, end: 100, file: 0, line: 1, column: 1 },
        { start: 40, end: 50, file: 0, line: 7, column: 3 },
      ],
    }),
  );
  // Ranges nest, so the enclosing statement must not win over the
  // expression the machine is actually inside.
  expect(lineAt(info, 45)?.line).toBe(7);
  expect(lineAt(info, 20)?.line).toBe(1);
  expect(lineAt(info, 200)).toBeNull();
});

test("symbolAt: labels the row with the last name that started before it", async () => {
  const { info } = await debugFor(PROGRAM);
  const first = info.symbols.reduce((a, b) => (a.addr <= b.addr ? a : b));
  expect(symbolAt(info, first.addr)?.name).toBe(first.name);
  expect(symbolAt(info, first.addr - 1)).toBeNull();
});

test("parseDebugInfo: an image without a debug section is absent, not an error", () => {
  expect(parseDebugInfo(null).present).toBe(false);
  expect(parseDebugInfo("not json").present).toBe(false);
  expect(parseDebugInfo(JSON.stringify({ symbols: [], files: [], lines: [] })).present).toBe(false);
});
