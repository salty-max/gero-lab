import { describe, expect, test } from "vitest";

import { hrefFor, parseHash } from "../src/lib/route.js";

describe("parseHash", () => {
  test("the book and the cockpit do not steal share links", () => {
    expect(parseHash("")).toEqual({ view: "lab" });
    expect(parseHash("#/")).toEqual({ view: "lab" });
    expect(parseHash("#p=abc")).toEqual({ view: "lab" });
    expect(parseHash("#/book")).toEqual({ view: "book", slug: "" });
    expect(parseHash("#/book/01-what-gero-is")).toEqual({
      view: "book",
      slug: "01-what-gero-is",
    });
  });

  test("hrefFor round-trips", () => {
    expect(hrefFor({ view: "lab" })).toBe("#/");
    expect(hrefFor({ view: "book", slug: "" })).toBe("#/book");
    expect(hrefFor({ view: "book", slug: "01-what-gero-is" })).toBe(
      "#/book/01-what-gero-is",
    );
  });
});
