import { describe, expect, test } from "vitest";

import { paintLine, tokenClass } from "../src/lib/highlight.js";

describe("paintLine", () => {
  test("an uncoloured line is one span", () => {
    expect(paintLine("def main()", [])).toEqual([{ text: "def main()", token: "" }]);
  });

  test("runs split the line on their start columns", () => {
    expect(
      paintLine("def main()", [
        { startIndex: 0, scopes: "keyword.mnemonic" },
        { startIndex: 4, scopes: "identifier" },
      ]),
    ).toEqual([
      { text: "def ", token: "keyword.mnemonic" },
      { text: "main()", token: "identifier" },
    ]);
  });
});

test("tokenClass maps a Monaco token to a CSS class", () => {
  expect(tokenClass("keyword.mnemonic")).toBe("tok-keyword-mnemonic");
  expect(tokenClass("")).toBeUndefined();
});
