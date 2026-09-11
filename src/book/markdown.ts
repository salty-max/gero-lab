/**
 * The book's markdown subset: ATX headings, fenced code, lists,
 * paragraphs, `---` rules, and the inline marks the chapters use
 * (`**bold**`, `*italic*`, `` `code` ``, `[text](href)`).
 *
 * Not a general markdown implementation. Tables, nested lists and
 * raw HTML are out — the book does not use them, and inventing a
 * second grammar for them would be the same drift the lab refuses
 * for highlighting.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "fence"; lang: string; code: string }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "hr" };

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length,
        children: parseInline(heading[2]!),
      });
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1; // closing fence
      blocks.push({ type: "fence", lang, code: body.join("\n") });
      continue;
    }
    const unordered = /^[-*]\s+/.test(line);
    const ordered = /^\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const items: Inline[][] = [];
      const bullet = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      while (i < lines.length && bullet.test(lines[i] ?? "")) {
        items.push(parseInline((lines[i] ?? "").replace(bullet, "")));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (
        next.trim() === "" ||
        next.startsWith("```") ||
        /^---+$/.test(next.trim()) ||
        /^(#{1,6})\s+/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(para.join(" ")) });
  }
  return blocks;
}

export function parseInline(input: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  const pushText = (value: string) => {
    const last = out[out.length - 1];
    if (last?.type === "text") last.value += value;
    else out.push({ type: "text", value });
  };
  while (i < input.length) {
    if (input.startsWith("**", i)) {
      const end = input.indexOf("**", i + 2);
      if (end !== -1) {
        out.push({ type: "strong", children: parseInline(input.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (input[i] === "*" && input[i + 1] !== "*") {
      const end = input.indexOf("*", i + 1);
      if (end !== -1) {
        out.push({ type: "em", children: parseInline(input.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (input[i] === "`") {
      const end = input.indexOf("`", i + 1);
      if (end !== -1) {
        out.push({ type: "code", value: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (input[i] === "[") {
      const close = input.indexOf("]", i + 1);
      if (close !== -1 && input[close + 1] === "(") {
        const hrefEnd = input.indexOf(")", close + 2);
        if (hrefEnd !== -1) {
          out.push({
            type: "link",
            href: input.slice(close + 2, hrefEnd),
            children: parseInline(input.slice(i + 1, close)),
          });
          i = hrefEnd + 1;
          continue;
        }
      }
    }
    pushText(input[i]!);
    i += 1;
  }
  return out;
}
