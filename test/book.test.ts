import { readFile } from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";

import {
  blurbOf,
  BookManifestError,
  decodeBooks,
  GERO_DOCS,
  isOpenableGero,
  loadBooks,
  rewriteHref,
  type Book,
} from "../src/book.js";

function serve(body: unknown, ok = true, status = 200) {
  return async (): Promise<Response> =>
    ({ ok, status, json: async () => body }) as Response;
}

const GERO: Book = {
  id: "book",
  title: "The Gero Book",
  chapters: [
    { slug: "", title: "The Gero Book", file: "README.md", body: "# The Gero Book\n\nThis book teaches\nGero.\n\nMore.\n" },
    { slug: "01-what-gero-is", title: "What Gero is", file: "01-what-gero-is.md", body: "" },
    { slug: "02-values-and-types", title: "Values and types", file: "02-values-and-types.md", body: "" },
  ],
};
const MACHINE: Book = {
  id: "machine",
  title: "The Gero Machine",
  chapters: [
    { slug: "", title: "The Gero Machine", file: "README.md", body: "" },
    { slug: "03-memory", title: "Memory", file: "03-memory.md", body: "" },
  ],
};
const BOOKS = [GERO, MACHINE];

describe("decodeBooks", () => {
  test("a newer manifest is named, not parsed hopefully", () => {
    expect(() => decodeBooks({ version: 99, books: [] })).toThrow(BookManifestError);
  });

  test("a manifest without books is refused", () => {
    expect(() => decodeBooks({ version: 2 })).toThrow(BookManifestError);
  });

  test("a book missing a field names the book it is in", () => {
    expect(() =>
      decodeBooks({ version: 2, books: [{ id: "machine", title: "M", chapters: [{ slug: "x" }] }] }),
    ).toThrow(/machine/);
  });

  test("a failed fetch says what to run", async () => {
    const fetchStub = serve(null, false, 404);
    vi.stubGlobal("fetch", fetchStub);
    await expect(loadBooks("/books.json")).rejects.toThrow(/npm run wasm/);
    vi.unstubAllGlobals();
  });
});

describe("rewriteHref", () => {
  test("a chapter of the book being read stays in the reader", () => {
    expect(rewriteHref("02-values-and-types.md", GERO, BOOKS)).toBe("#/book/book/02-values-and-types");
    expect(rewriteHref("README.md", GERO, BOOKS)).toBe("#/book/book");
  });

  test("a link into the other book stays in the reader too", () => {
    // The two volumes cross-reference each other constantly; sending a
    // reader to the repository to be told they are companions is silly.
    expect(rewriteHref("../machine/README.md", GERO, BOOKS)).toBe("#/book/machine");
    expect(rewriteHref("../machine/03-memory.md", GERO, BOOKS)).toBe("#/book/machine/03-memory");
    expect(rewriteHref("../book/01-what-gero-is.md", MACHINE, BOOKS)).toBe(
      "#/book/book/01-what-gero-is",
    );
  });

  test("a specification still leaves for gero", () => {
    expect(rewriteHref("../lang.md", GERO, BOOKS)).toBe(`${GERO_DOCS}/lang.md`);
    expect(rewriteHref("../isa.md", MACHINE, BOOKS)).toBe(`${GERO_DOCS}/isa.md`);
  });

  test("an anchor survives the rewrite", () => {
    expect(rewriteHref("03-memory.md#labels", MACHINE, BOOKS)).toBe(
      "#/book/machine/03-memory#labels",
    );
  });

  test("an absolute link is left alone", () => {
    expect(rewriteHref("https://example.com/x", GERO, BOOKS)).toBe("https://example.com/x");
  });
});

describe("blurbOf", () => {
  test("the front matter's first paragraph, unwrapped", () => {
    expect(blurbOf(GERO)).toBe("This book teaches Gero.");
  });
});

test("a fragment fence is not opened in the lab", () => {
  expect(isOpenableGero("-- fragment: elided\ndef f()\nend")).toBe(false);
  expect(isOpenableGero('def main()\n  print "hi"\nend')).toBe(true);
});

test("the packed manifest carries both books", async () => {
  const raw = JSON.parse(await readFile("public/books.json", "utf8")) as unknown;
  const books = decodeBooks(raw);
  expect(books.map((b) => b.id)).toEqual(["book", "machine"]);
  for (const book of books) {
    // Front matter first, so a book opens on what it is for.
    expect(book.chapters[0]?.slug).toBe("");
    expect(book.chapters.length).toBeGreaterThan(4);
  }
});
