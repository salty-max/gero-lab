/**
 * Hash routes. Share links occupy `#p=…` (share.ts); the book occupies
 * `#/book` and `#/book/<slug>`. Anything else is the cockpit.
 */

export type Route = { view: "lab" } | { view: "book"; slug: string };

export function parseHash(hash: string): Route {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "/book" || raw === "book") return { view: "book", slug: "" };
  const chapter = /^\/book\/([^/?#]+)$/.exec(raw);
  if (chapter) return { view: "book", slug: decodeURIComponent(chapter[1]!) };
  return { view: "lab" };
}

export function hrefFor(route: Route): string {
  if (route.view === "lab") return "#/";
  return route.slug === "" ? "#/book" : `#/book/${encodeURIComponent(route.slug)}`;
}
