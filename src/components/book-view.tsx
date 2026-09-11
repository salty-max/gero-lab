import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, PlayIcon } from "lucide-react";

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
import { useSnippetActions, type SnippetResult } from "@/hooks/use-snippet-actions";
import { hrefFor } from "@/lib/route";
import { cn } from "@/lib/utils";

type BookViewProps = {
  slug: string;
};

export function BookView({ slug }: BookViewProps) {
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
          <ChapterBody chapter={chapter} book={book} />
          <ChapterPager book={book} chapter={chapter} />
        </article>
      </div>
    </div>
  );
}

function ChapterBody({
  chapter,
  book,
}: {
  chapter: Chapter;
  book: Book;
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
        />
      ))}
    </>
  );
}

function BlockView({
  block,
  slugs,
}: {
  block: Block;
  slugs: ReadonlySet<string>;
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
      return <Fence block={block} />;
  }
}

function fenceHighlightLang(lang: string): "gr" | "gas" | null {
  if (lang === "gero" || lang === "gr") return "gr";
  if (lang === "asm" || lang === "gas") return "gas";
  return null;
}

function Fence({
  block,
}: {
  block: Extract<Block, { type: "fence" }>;
}) {
  const { runInPlace, openInLab, ready } = useSnippetActions();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SnippetResult | null>(null);
  const openLang: "gero" | "asm" | null =
    (block.lang === "gero" || block.lang === "asm") && isOpenableGero(block.code)
      ? block.lang
      : null;
  const colour = fenceHighlightLang(block.lang);
  const label = block.lang === "" ? "output" : block.lang;

  const run = async () => {
    if (!openLang || busy) return;
    setBusy(true);
    try {
      setResult(await runInPlace(block.code, openLang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>{label}</span>
        {openLang ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={!ready || busy} onClick={() => void run()}>
              {busy ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
              Run
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!ready || busy}
              onClick={() => void openInLab(block.code, openLang)}
            >
              Open in lab
            </Button>
          </div>
        ) : null}
      </div>
      {colour ? (
        <HighlightedCode code={block.code} lang={colour} />
      ) : (
        <pre className="overflow-x-auto p-3 text-sm leading-6">
          <code>{block.code}</code>
        </pre>
      )}
      {result ? <SnippetOut result={result} /> : null}
    </div>
  );
}

function SnippetOut({ result }: { result: SnippetResult }) {
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    return (
      <pre className="border-t border-border bg-destructive/10 p-3 text-sm leading-6 text-destructive">
        {errors.map((d) => `${d.message}${d.code ? ` [${d.code}]` : ""}`).join("\n")}
      </pre>
    );
  }
  if (result.timedOut) {
    return (
      <p className="border-t border-border px-3 py-2 text-sm text-muted-foreground">
        did not halt
      </p>
    );
  }
  if (result.fault) {
    return (
      <pre className="border-t border-border bg-destructive/10 p-3 text-sm text-destructive">
        {result.fault}
      </pre>
    );
  }
  return (
    <pre className="border-t border-border bg-muted/40 p-3 text-sm leading-6">
      {result.output.length > 0 ? result.output : "(no output)"}
    </pre>
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
