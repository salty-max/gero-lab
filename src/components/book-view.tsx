import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, PlayIcon } from "lucide-react";

import {
  blurbOf,
  isOpenableGero,
  loadBooks,
  rewriteHref,
  type Book,
  type Chapter,
} from "@/book";
import { parseInline, parseMarkdown, type Block, type Inline } from "@/book/markdown";
import { Button } from "@/components/ui/button";
import { HighlightedCode } from "@/components/highlighted-code";
import { useSnippetActions, type SnippetResult } from "@/hooks/use-snippet-actions";
import { hrefFor } from "@/lib/route";
import { cn } from "@/lib/utils";

/** What a link in a chapter resolves against: the book being read, and
 *  the others it can point into. */
type LinkContext = { current: Book; books: readonly Book[] };

/** Load the library once per mount, and report a failure as text rather
 *  than an empty reader — a missing `books.json` means `npm run wasm`
 *  has not run, which the message says. */
function useLibrary() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadBooks()
      .then(setBooks)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "could not load the books"),
      );
  }, []);
  return { books, error };
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** The library: both books, with what each is for. */
export function LibraryView() {
  const { books, error } = useLibrary();
  if (error) return <Centered>{error}</Centered>;
  if (!books) return <Centered>Loading the books…</Centered>;

  return (
    <div className="min-h-0 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">The books</h1>
          <p className="text-sm text-muted-foreground">
            Two of them, and neither is a prerequisite for the other. Read one to
            learn programming by making a cart; read the other to learn what the
            machine is doing while that cart runs.
          </p>
        </div>
        <ul className="flex flex-col gap-4">
          {books.map((book) => (
            <li key={book.id}>
              <a
                href={hrefFor({ view: "book", book: book.id, slug: "" })}
                className="flex flex-col gap-2 rounded-lg border border-border p-5 transition-colors hover:border-gero hover:bg-accent/40"
              >
                <span className="text-lg font-medium text-gero">{book.title}</span>
                <span className="text-sm text-muted-foreground">
                  <Inlines
                    nodes={parseInline(blurbOf(book))}
                    links={{ current: book, books }}
                  />
                </span>
                <span className="text-xs text-muted-foreground">
                  {chapterCount(book)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Front matter is a chapter with an empty slug, and is not one of the
 *  numbered ones a reader is being told the length of. */
function chapterCount(book: Book): string {
  const n = book.chapters.filter((c) => c.slug !== "").length;
  return `${String(n)} chapter${n === 1 ? "" : "s"}`;
}

type BookViewProps = {
  book: string;
  slug: string;
};

export function BookView({ book: bookId, slug }: BookViewProps) {
  const { books, error } = useLibrary();
  if (error) return <Centered>{error}</Centered>;
  if (!books) return <Centered>Loading the books…</Centered>;

  const book = books.find((b) => b.id === bookId);
  if (!book) {
    // `#/book/<slug>` predates the second book. The first segment is a
    // chapter of the first book, so send the reader where they meant.
    const legacy = books[0]?.chapters.find((c) => c.slug === bookId);
    if (legacy && books[0]) {
      return <Redirect to={hrefFor({ view: "book", book: books[0].id, slug: legacy.slug })} />;
    }
    return <Centered>No book called “{bookId}”.</Centered>;
  }

  const chapter = book.chapters.find((c) => c.slug === slug) ?? book.chapters[0];
  if (!chapter) return <Centered>That book has no chapters.</Centered>;

  const links: LinkContext = { current: book, books };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[16rem_1fr]">
      <nav className="hidden min-h-0 flex-col overflow-y-auto border-r border-border md:flex">
        <BookSwitcher books={books} current={book} atFrontMatter={chapter.slug === ""} />
        <ol className="flex flex-col gap-1 p-4 pt-2 text-sm">
          {book.chapters.filter((c) => c.slug !== "").map((c) => (
            <li key={c.file}>
              <a
                href={hrefFor({ view: "book", book: book.id, slug: c.slug })}
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
      <div className="min-h-0 min-w-0 overflow-y-auto">
        <ChapterMenu books={books} book={book} chapter={chapter} />
        <article className="mx-auto flex min-w-0 max-w-3xl flex-col gap-4 px-6 py-8">
          <ChapterBody chapter={chapter} links={links} />
          <ChapterPager book={book} chapter={chapter} />
        </article>
      </div>
    </div>
  );
}

/** The sidebar's contents, for a viewport too narrow to carry one.
 *  A reader on a phone still needs to reach another chapter without
 *  paging through every one between here and it. */
function ChapterMenu({
  books,
  book,
  chapter,
}: {
  books: readonly Book[];
  book: Book;
  chapter: Chapter;
}) {
  return (
    <details className="border-b border-border md:hidden">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm text-muted-foreground marker:hidden">
        <span className="text-gero">{book.title}</span>
        <span className="px-2">·</span>
        {chapter.slug === "" ? "Front matter" : chapter.title}
      </summary>
      <div className="flex flex-col gap-1 px-4 pb-4 text-sm">
        <a href={hrefFor({ view: "library" })} className="py-1 text-xs text-muted-foreground">
          ← All books
        </a>
        {books
          .filter((b) => b.id !== book.id)
          .map((b) => (
            <a key={b.id} href={hrefFor({ view: "book", book: b.id, slug: "" })} className="py-1 text-muted-foreground">
              {b.title}
            </a>
          ))}
        <a
          href={hrefFor({ view: "book", book: book.id, slug: "" })}
          className={cn("rounded-md px-2 py-1.5", chapter.slug === "" && "bg-accent text-gero")}
        >
          {book.title}
        </a>
        {book.chapters
          .filter((c) => c.slug !== "")
          .map((c) => (
            <a
              key={c.file}
              href={hrefFor({ view: "book", book: book.id, slug: c.slug })}
              className={cn("rounded-md px-2 py-1.5", c.slug === chapter.slug && "bg-accent text-gero")}
            >
              {c.title}
            </a>
          ))}
      </div>
    </details>
  );
}

/** Move between books without going back to the library. The reader is
 *  in one of two volumes that cross-reference each other constantly. */
function BookSwitcher({
  books,
  current,
  atFrontMatter,
}: {
  books: readonly Book[];
  current: Book;
  atFrontMatter: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border p-4 pb-3">
      <a
        href={hrefFor({ view: "library" })}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← All books
      </a>
      <div className="flex flex-col gap-0.5 pt-1">
        {books.map((b) => (
          <a
            key={b.id}
            href={hrefFor({ view: "book", book: b.id, slug: "" })}
            className={cn(
              "rounded-md px-2 py-1 text-sm",
              b.id === current.id
                ? "font-medium text-gero"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              b.id === current.id && atFrontMatter && "bg-accent",
            )}
          >
            {b.title}
          </a>
        ))}
      </div>
    </div>
  );
}

/** A legacy link resolves to a real one without leaving a dead entry in
 *  the reader's history. */
function Redirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return <Centered>Taking you there…</Centered>;
}

function ChapterBody({
  chapter,
  links,
}: {
  chapter: Chapter;
  links: LinkContext;
}) {
  const blocks = useMemo(() => parseMarkdown(chapter.body), [chapter.body]);
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView
          key={`${chapter.slug}:${String(i)}`}
          block={block}
          links={links}
        />
      ))}
    </>
  );
}

function BlockView({
  block,
  links,
}: {
  block: Block;
  links: LinkContext;
}) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${String(block.level)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6");
      const size =
        block.level === 1 ? "text-3xl" : block.level === 2 ? "text-xl" : "text-lg";
      return (
        <Tag className={cn("font-semibold tracking-tight", size, block.level === 1 && "text-gero")}>
          <Inlines nodes={block.children} links={links} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="leading-7 text-foreground/90">
          <Inlines nodes={block.children} links={links} />
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
              <Inlines nodes={item} links={links} />
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
  links,
}: {
  nodes: Inline[];
  links: LinkContext;
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
                <Inlines nodes={n.children} links={links} />
              </strong>
            );
          case "em":
            return (
              <em key={key}>
                <Inlines nodes={n.children} links={links} />
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
            const href = rewriteHref(n.href, links.current, links.books);
            const external = href.startsWith("http");
            return (
              <a
                key={key}
                href={href}
                className="text-gero underline-offset-4 hover:underline"
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                <Inlines nodes={n.children} links={links} />
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
        <a href={hrefFor({ view: "book", book: book.id, slug: prev.slug })} className="text-gero hover:underline">
          ← {prev.title}
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a href={hrefFor({ view: "book", book: book.id, slug: next.slug })} className="text-gero hover:underline">
          {next.title} →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
