import { useEffect, useMemo, useState } from "react";
import { PlayIcon } from "lucide-react";

import {
  isOpenableGero,
  loadBook,
  rewriteHref,
  type Book,
  type Chapter,
} from "@/book";
import { parseMarkdown, type Block, type Inline } from "@/book/markdown";
import { Button } from "@/components/ui/button";
import { HighlightedCode } from "@/components/highlighted-code";
import { hrefFor } from "@/lib/route";
import { cn } from "@/lib/utils";

type BookViewProps = {
  slug: string;
  onOpenSnippet: (code: string, lang: "gero" | "asm") => void;
};

export function BookView({ slug, onOpenSnippet }: BookViewProps) {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBook()
      .then(setBook)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "could not load the book"),
      );
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }
  if (!book) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading the book…
      </div>
    );
  }

  const chapter = book.chapters.find((c) => c.slug === slug) ?? book.chapters[0];
  if (!chapter) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No chapters in this book.json.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[16rem_1fr]">
      <nav className="hidden min-h-0 overflow-y-auto border-r border-border md:block">
        <ol className="flex flex-col gap-1 p-4 text-sm">
          {book.chapters.map((c) => (
            <li key={c.file}>
              <a
                href={hrefFor({ view: "book", slug: c.slug })}
                className={cn(
                  "block rounded-md px-2 py-1.5 hover:bg-accent",
                  c.slug === chapter.slug && "bg-accent text-gero",
                )}
              >
                {c.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-h-0 overflow-y-auto">
        <article className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
          <ChapterBody chapter={chapter} book={book} onOpenSnippet={onOpenSnippet} />
          <ChapterPager book={book} chapter={chapter} />
        </article>
      </div>
    </div>
  );
}

function ChapterBody({
  chapter,
  book,
  onOpenSnippet,
}: {
  chapter: Chapter;
  book: Book;
  onOpenSnippet: (code: string, lang: "gero" | "asm") => void;
}) {
  const slugs = useMemo(
    () => new Set(book.chapters.map((c) => c.slug).filter(Boolean)),
    [book],
  );
  const blocks = useMemo(() => parseMarkdown(chapter.body), [chapter.body]);
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView
          key={`${chapter.slug}:${String(i)}`}
          block={block}
          slugs={slugs}
          onOpenSnippet={onOpenSnippet}
        />
      ))}
    </>
  );
}

function BlockView({
  block,
  slugs,
  onOpenSnippet,
}: {
  block: Block;
  slugs: ReadonlySet<string>;
  onOpenSnippet: (code: string, lang: "gero" | "asm") => void;
}) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${String(block.level)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6");
      const size =
        block.level === 1 ? "text-3xl" : block.level === 2 ? "text-xl" : "text-lg";
      return (
        <Tag className={cn("font-semibold tracking-tight", size, block.level === 1 && "text-gero")}>
          <Inlines nodes={block.children} slugs={slugs} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="leading-7 text-foreground/90">
          <Inlines nodes={block.children} slugs={slugs} />
        </p>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          className={cn(
            "flex flex-col gap-1 pl-6 leading-7",
            block.ordered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items.map((item) => (
            <li key={plainText(item)}>
              <Inlines nodes={item} slugs={slugs} />
            </li>
          ))}
        </List>
      );
    }
    case "hr":
      return <hr className="border-border" />;
    case "fence":
      return <Fence block={block} onOpenSnippet={onOpenSnippet} />;
  }
}

function fenceHighlightLang(lang: string): "gr" | "gas" | null {
  if (lang === "gero" || lang === "gr") return "gr";
  if (lang === "asm" || lang === "gas") return "gas";
  return null;
}

function Fence({
  block,
  onOpenSnippet,
}: {
  block: Extract<Block, { type: "fence" }>;
  onOpenSnippet: (code: string, lang: "gero" | "asm") => void;
}) {
  const openLang: "gero" | "asm" | null =
    (block.lang === "gero" || block.lang === "asm") && isOpenableGero(block.code)
      ? block.lang
      : null;
  const colour = fenceHighlightLang(block.lang);
  const label = block.lang === "" ? "output" : block.lang;
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>{label}</span>
        {openLang ? (
          <Button size="sm" variant="ghost" onClick={() => onOpenSnippet(block.code, openLang)}>
            <PlayIcon />
            Open in lab
          </Button>
        ) : null}
      </div>
      {colour ? (
        <HighlightedCode code={block.code} lang={colour} />
      ) : (
        <pre className="overflow-x-auto p-3 text-sm leading-6">
          <code>{block.code}</code>
        </pre>
      )}
    </div>
  );
}

function Inlines({
  nodes,
  slugs,
}: {
  nodes: Inline[];
  slugs: ReadonlySet<string>;
}) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${n.type}:${plainText([n])}:${String(i)}`;
        switch (n.type) {
          case "text":
            return <span key={key}>{n.value}</span>;
          case "strong":
            return (
              <strong key={key}>
                <Inlines nodes={n.children} slugs={slugs} />
              </strong>
            );
          case "em":
            return (
              <em key={key}>
                <Inlines nodes={n.children} slugs={slugs} />
              </em>
            );
          case "code":
            return (
              <code
                key={key}
                className="rounded bg-muted px-1 py-0.5 text-[0.9em] text-gero"
              >
                {n.value}
              </code>
            );
          case "link": {
            const href = rewriteHref(n.href, slugs);
            const external = href.startsWith("http");
            return (
              <a
                key={key}
                href={href}
                className="text-gero underline-offset-4 hover:underline"
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                <Inlines nodes={n.children} slugs={slugs} />
              </a>
            );
          }
        }
      })}
    </>
  );
}

function plainText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
        case "code":
          return n.value;
        case "strong":
        case "em":
        case "link":
          return plainText(n.children);
      }
    })
    .join("");
}

function ChapterPager({ book, chapter }: { book: Book; chapter: Chapter }) {
  const idx = book.chapters.findIndex((c) => c.slug === chapter.slug);
  const prev = idx > 0 ? book.chapters[idx - 1] : undefined;
  const next = idx >= 0 && idx < book.chapters.length - 1 ? book.chapters[idx + 1] : undefined;
  if (!prev && !next) return null;
  return (
    <nav className="mt-8 flex items-center justify-between border-t border-border pt-4 text-sm">
      {prev ? (
        <a href={hrefFor({ view: "book", slug: prev.slug })} className="text-gero hover:underline">
          ← {prev.title}
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a href={hrefFor({ view: "book", slug: next.slug })} className="text-gero hover:underline">
          {next.title} →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
