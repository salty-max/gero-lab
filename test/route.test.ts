import { describe, expect, test } from "vitest";

import { hrefFor, parseHash } from "../src/lib/route.js";

describe("parseHash", () => {
  test("the books and the cockpit do not steal share links", () => {
    expect(parseHash("")).toEqual({ view: "lab" });
    expect(parseHash("#/")).toEqual({ view: "lab" });
    expect(parseHash("#p=abc")).toEqual({ view: "lab" });
    expect(parseHash("#/books")).toEqual({ view: "library" });
    expect(parseHash("#/book/machine")).toEqual({ view: "book", book: "machine", slug: "" });
    expect(parseHash("#/book/machine/03-memory")).toEqual({
      view: "book",
      book: "machine",
      slug: "03-memory",
    });
  });

  test("`#/book` predates the second book and now names the library", () => {
    // It used to open the reader, which is the library's job now.
    expect(parseHash("#/book")).toEqual({ view: "library" });
  });

  test("a one-segment path is parsed positionally, not resolved", () => {
    // Whether `01-what-gero-is` is a book or a chapter of one depends
    // on which books exist, which the reader answers, not the route.
    expect(parseHash("#/book/01-what-gero-is")).toEqual({
      view: "book",
      book: "01-what-gero-is",
      slug: "",
    });
  });

  test("hrefFor round-trips", () => {
    expect(hrefFor({ view: "lab" })).toBe("#/");
    expect(hrefFor({ view: "library" })).toBe("#/books");
    expect(hrefFor({ view: "book", book: "book", slug: "" })).toBe("#/book/book");
    expect(hrefFor({ view: "book", book: "machine", slug: "03-memory" })).toBe(
      "#/book/machine/03-memory",
    );
  });
});
