import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  BookManifestError,
  decodeBook,
  GERO_DOCS,
  isOpenableGero,
  loadBook,
  rewriteHref,
} from "../src/book.js";

function serve(body: unknown, ok = true, status = 200) {
  return async (): Promise<Response> =>
    ({ ok, status, json: async () => body }) as Response;
}

describe("decodeBook", () => {
  test("a newer manifest is named, not parsed hopefully", () => {
    expect(() => decodeBook({ version: 99, title: "x", chapters: [] })).toThrow(
      BookManifestError,
    );
  });

  test("rewrites in-book links to the hash router and specs to GitHub", () => {
    const slugs = new Set(["01-what-gero-is", "02-values-and-types"]);
    expect(rewriteHref("02-values-and-types.md", slugs)).toBe("#/book/02-values-and-types");
    expect(rewriteHref("../lang.md", slugs)).toBe(`${GERO_DOCS}/lang.md`);
    expect(rewriteHref("../machine/README.md", slugs)).toBe(`${GERO_DOCS}/machine/README.md`);
    expect(rewriteHref("https://example.com/x", slugs)).toBe("https://example.com/x");
  });

  test("a fragment fence is not opened in the lab", () => {
    expect(isOpenableGero("-- fragment: elided\ndef f()\nend")).toBe(false);
    expect(isOpenableGero('def main()\n  print "hi"\nend')).toBe(true);
  });
});

test("the packed book has front matter and chapters 1–4", async () => {
  const raw = JSON.parse(await readFile("public/book.json", "utf8")) as unknown;
  const book = decodeBook(raw);
  expect(book.chapters.map((c) => c.slug)).toEqual([
    "",
    "01-what-gero-is",
    "02-values-and-types",
    "03-control-flow",
    "04-functions",
  ]);
  expect(book.chapters[1]?.body).toContain("Hello, gero!");
});

test("loadBook says how to place a missing manifest", async () => {
  globalThis.fetch = serve(null, false, 404) as typeof fetch;
  await expect(loadBook()).rejects.toThrow(/npm run wasm/);
});
