/**
 * The books (gero-lab.md §10).
 *
 * Packed from gero's `docs/book/` and `docs/machine/` and published
 * beside the module as `books.json`, so a chapter cannot drift from
 * the text CI compiles. Fetched, never vendored — the same rule the
 * samples follow.
 */

export const BOOKS_MANIFEST_VERSION = 2;

export interface Chapter {
  slug: string;
  title: string;
  file: string;
  body: string;
}

export interface Book {
  /** What a reader's URL carries, and what a cross-book link
   *  resolves against. */
  id: string;
  title: string;
  chapters: Chapter[];
}

export class BookManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookManifestError";
  }
}

/** Load every book from `public/books.json`, in reading order. */
export async function loadBooks(url = "/books.json"): Promise<Book[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new BookManifestError(
      `could not fetch ${url} (${String(response.status)}) — run \`npm run wasm\` to place it in public/`,
    );
  }
  return decodeBooks(await response.json());
}

export function decodeBooks(body: unknown): Book[] {
  const manifest = body as { version?: number; books?: Book[] };
  if (manifest.version !== BOOKS_MANIFEST_VERSION) {
    throw new BookManifestError(
      `books.json is version ${String(manifest.version)}, this build reads ${String(BOOKS_MANIFEST_VERSION)}`,
    );
  }
  if (!Array.isArray(manifest.books)) {
    throw new BookManifestError("books.json does not carry a books array");
  }
  for (const book of manifest.books) {
    if (typeof book.id !== "string" || typeof book.title !== "string" || !Array.isArray(book.chapters)) {
      throw new BookManifestError("books.json has a book with a missing field");
    }
    for (const ch of book.chapters) {
      if (
        typeof ch.slug !== "string" ||
        typeof ch.title !== "string" ||
        typeof ch.file !== "string" ||
        typeof ch.body !== "string"
      ) {
        throw new BookManifestError(`books.json has a chapter with a missing field in \`${book.id}\``);
      }
    }
  }
  return manifest.books;
}

/** The first paragraph of a book's front matter, for the library card. */
export function blurbOf(book: Book): string {
  const front = book.chapters.find((c) => c.slug === "");
  if (!front) return "";
  const body = front.body.replace(/^#\s+.+$/m, "").trimStart();
  const para = body.split(/\n\s*\n/)[0] ?? "";
  return para.replace(/\s*\n\s*/g, " ").trim();
}

/** Spec files the books link with `../foo.md` — those stay in gero. */
export const GERO_DOCS = "https://github.com/salty-max/gero/blob/main/docs";

/**
 * Rewrite a markdown href for the lab.
 *
 * A chapter of the book being read stays in the reader. So does a link
 * into the *other* book: the two cross-reference each other in their
 * front matter, and sending a reader to the repository to be told these
 * are companion volumes rather undercuts the point. Everything else
 * under `docs/` is a specification, which lives in gero.
 */
export function rewriteHref(href: string, current: Book, books: readonly Book[]): string {
  if (/^https?:\/\//.test(href)) return href;
  const [path = href, hash] = href.split("#");
  const suffix = hash ? `#${hash}` : "";

  // `../<book>/<file>.md` — the other book, when that directory is one.
  const other = /^\.\.\/([^/]+)\/([^/]+)\.md$/.exec(path);
  if (other) {
    // A book's directory under `docs/` is its id.
    const book = books.find((b) => b.id === other[1]);
    if (book) {
      const slug = other[2] === "README" ? "" : other[2]!;
      return chapterHref(book.id, slug) + suffix;
    }
  }

  const file = path.split("/").pop() ?? path;
  const slug = file.replace(/\.md$/, "");
  if (!path.startsWith("../") && (file === "README.md" || current.chapters.some((c) => c.slug === slug))) {
    return chapterHref(current.id, slug === "README" ? "" : slug) + suffix;
  }
  if (path.startsWith("../")) {
    return `${GERO_DOCS}/${path.slice(3)}${suffix}`;
  }
  return href;
}

function chapterHref(book: string, slug: string): string {
  return slug === ""
    ? `#/book/${encodeURIComponent(book)}`
    : `#/book/${encodeURIComponent(book)}/${encodeURIComponent(slug)}`;
}

/** A ```gero block the playground can open: not a `-- fragment`. */
export function isOpenableGero(code: string): boolean {
  const first = code.trimStart().split("\n")[0] ?? "";
  return !first.startsWith("-- fragment");
}
