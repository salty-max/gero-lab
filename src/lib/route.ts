/**
 * Hash routes. Share links occupy `#p=…` (share.ts); the library
 * occupies `#/books`, a book `#/book/<book>`, and a chapter
 * `#/book/<book>/<slug>`. Anything else is the cockpit.
 *
 * A book's id and a chapter's slug are parsed positionally, not
 * resolved here: whether `#/book/machine` names a book or a chapter of
 * another one is a question about which books exist, which the reader
 * answers once it has them.
 */

export type Route =
  | { view: "lab" }
  | { view: "library" }
  | { view: "book"; book: string; slug: string };

export function parseHash(hash: string): Route {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "/books" || raw === "books") return { view: "library" };
  // `#/book` predates the second book and named the reader itself.
  if (raw === "/book" || raw === "book") return { view: "library" };
  const path = /^\/book\/([^/?#]+)(?:\/([^/?#]+))?$/.exec(raw);
  if (path) {
    return {
      view: "book",
      book: decodeURIComponent(path[1]!),
      slug: path[2] === undefined ? "" : decodeURIComponent(path[2]),
    };
  }
  return { view: "lab" };
}

export function hrefFor(route: Route): string {
  if (route.view === "lab") return "#/";
  if (route.view === "library") return "#/books";
  const book = encodeURIComponent(route.book);
  return route.slug === "" ? `#/book/${book}` : `#/book/${book}/${encodeURIComponent(route.slug)}`;
}
