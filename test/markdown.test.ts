import { describe, expect, test } from "vitest";

import { parseMarkdown } from "../src/book/markdown.js";

describe("parseMarkdown", () => {
  test("headings, fences, lists and inline marks", () => {
    const blocks = parseMarkdown(`# 1. Title

A **bold** word and \`let x\` and *italic*.

- one
- two

1. first
2. second

\`\`\`gero
def main()
  print 1
end
\`\`\`

[next](02-values-and-types.md)

---
`);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "fence",
      "paragraph",
      "hr",
    ]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[4]).toMatchObject({ type: "fence", lang: "gero" });
    expect(blocks[4]).toEqual(
      expect.objectContaining({ type: "fence", code: expect.stringContaining("def main()") }),
    );
    expect(blocks[3]).toMatchObject({ type: "list", ordered: true });
  });

  test("an italic paragraph is not a list", () => {
    const blocks = parseMarkdown("*Chapters 5–12 land next.*\n");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("paragraph");
  });

  test("wrapped list items keep their descriptions and inline marks", () => {
    expect(parseMarkdown(`1. [First](first.md) — a
   **wrapped** description.
2. Second
   with another line.

After the list.

- A bullet with
  a continuation.
- Another bullet.
`)).toEqual([
      {
        type: "list", ordered: true, items: [
          [
            { type: "link", href: "first.md", children: [{ type: "text", value: "First" }] },
            { type: "text", value: " — a " },
            { type: "strong", children: [{ type: "text", value: "wrapped" }] },
            { type: "text", value: " description." },
          ],
          [{ type: "text", value: "Second with another line." }],
        ],
      },
      { type: "paragraph", children: [{ type: "text", value: "After the list." }] },
      {
        type: "list", ordered: false, items: [
          [{ type: "text", value: "A bullet with a continuation." }],
          [{ type: "text", value: "Another bullet." }],
        ],
      },
    ]);
  });
});
