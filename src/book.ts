/**
 * The Gero Book (gero-lab.md §10).
 *
 * Packed from gero's `docs/book/` and published beside the module as
 * `book.json`, so a chapter cannot drift from the text CI compiles.
 * Fetched, never vendored — the same rule the samples follow.
 */

export const BOOK_MANIFEST_VERSION = 1;

export interface Chapter {
  slug: string;
  title: string;
  file: string;
  body: string;
}

export interface Book {
  title: string;
  chapters: Chapter[];
}

export class BookManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookManifestError";
  }
}

/** Load the book from `public/book.json`. */
export async function loadBook(url = "/book.json"): Promise<Book> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new BookManifestError(
      `could not fetch ${url} (${String(response.status)}) — run \`npm run wasm\` to place it in public/`,
    );
  }
  return decodeBook(await response.json());
}

export function decodeBook(body: unknown): Book {
  const manifest = body as { version?: number; title?: string; chapters?: Chapter[] };
  if (manifest.version !== BOOK_MANIFEST_VERSION) {
    throw new BookManifestError(
      `book.json is version ${String(manifest.version)}, this build reads ${String(BOOK_MANIFEST_VERSION)}`,
    );
  }
  if (typeof manifest.title !== "string" || !Array.isArray(manifest.chapters)) {
    throw new BookManifestError("book.json does not carry a title and chapters");
  }
  for (const ch of manifest.chapters) {
    if (
      typeof ch.slug !== "string" ||
      typeof ch.title !== "string" ||
      typeof ch.file !== "string" ||
      typeof ch.body !== "string"
    ) {
      throw new BookManifestError("book.json has a chapter with a missing field");
    }
  }
  return { title: manifest.title, chapters: manifest.chapters };
}

/** Spec files the book links with `../foo.md` — those stay in gero. */
export const GERO_DOCS = "https://github.com/salty-max/gero/blob/main/docs";

/** Rewrite a markdown href for the lab: in-book chapters stay in the
 *  reader, everything else under `docs/` goes to the spec on GitHub. */
export function rewriteHref(href: string, chapterSlugs: ReadonlySet<string>): string {
  if (/^https?:\/\//.test(href)) return href;
  const path = href.split("#")[0] ?? href;
  const file = path.split("/").pop() ?? path;
  const slug = file.replace(/\.md$/, "");
  // Front matter and chapter files live beside each other. A `../`
  // link is a spec in the gero repo, including the other book's README.
  if (!path.startsWith("../") && (file === "README.md" || chapterSlugs.has(slug))) {
    return slug === "README" || slug === "" ? "#/book" : `#/book/${slug}`;
  }
  if (path.startsWith("../")) {
    return `${GERO_DOCS}/${path.slice(3)}`;
  }
  return href;
}

/** A ```gero block the playground can open: not a `-- fragment`. */
export function isOpenableGero(code: string): boolean {
  const first = code.trimStart().split("\n")[0] ?? "";
  return !first.startsWith("-- fragment");
}
