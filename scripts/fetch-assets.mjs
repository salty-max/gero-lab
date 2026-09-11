/**
 * Place the module and its sample manifest in `public/`.
 *
 * None of them is vendored: a checked-in copy is a module that can lag
 * the toolchain it exposes, a sample set that can drift from the corpus
 * CI proves works, or a book whose examples no longer compile. They are
 * fetched, and `public/` is gitignored (`docs/gero-lab.md` §9, §10).
 *
 *   GERO_DIST=/dir/of/assets  node scripts/fetch-assets.mjs
 *   GERO_ROOT=/path/to/gero   node scripts/fetch-assets.mjs
 *   GERO_TAG=v0.3.0           node scripts/fetch-assets.mjs
 *
 * With none of them, a sibling gero checkout is used — the working-tree
 * module, which is what you want while developing against an unreleased
 * toolchain.
 */

import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");

/** What a release publishes as loose assets, and where `zig build wasm`
 *  leaves each one in a checkout. */
const ASSETS = [
  { name: "gero.wasm", built: "zig-out/bin/gero.wasm" },
  { name: "samples.json", built: "zig-out/samples/samples.json" },
  { name: "book.json", built: "zig-out/book/book.json" },
];

/**
 * The grammars the editor colours with (gero-lab.md §4.3).
 *
 * The same tree-sitter grammars the native editors use, pinned to the
 * tags that carry a browser artifact — earlier tags carry the grammar
 * but no `.wasm`. `highlights.scm` is the lab's theme mapping too, so
 * it comes from the same tag rather than from a copy kept here.
 */
const GRAMMARS = [
  { repo: "tree-sitter-gero-asm", tag: "v0.3.1", wasm: "tree-sitter-gero_asm.wasm" },
  { repo: "tree-sitter-gero-lang", tag: "v0.1.1", wasm: "tree-sitter-gero_lang.wasm" },
];

const grammarUrls = ({ repo, tag, wasm }) => [
  {
    name: wasm,
    url: `https://github.com/salty-max/${repo}/releases/download/${tag}/${wasm}`,
  },
  {
    name: `${wasm.replace(/\.wasm$/, "")}.highlights.scm`,
    url: `https://raw.githubusercontent.com/salty-max/${repo}/${tag}/queries/highlights.scm`,
  },
];

async function fetchGrammars() {
  for (const grammar of GRAMMARS) {
    for (const { name, url } of grammarUrls(grammar)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} returned ${String(response.status)}`);
      await writeFile(join(publicDir, name), Buffer.from(await response.arrayBuffer()));
    }
  }
}

const releaseUrl = (tag, name) =>
  `https://github.com/salty-max/gero/releases/download/${tag}/${name}`;

/** A gero checkout to take them from, `zig build wasm` already run. */
const geroRoot = () => resolve(root, process.env.GERO_ROOT ?? "../gero");

async function main() {
  await mkdir(publicDir, { recursive: true });

  await fetchGrammars();

  const dist = process.env.GERO_DIST;
  if (dist) {
    for (const a of ASSETS) {
      await copyFile(resolve(dist, a.name), join(publicDir, a.name));
    }
    return report(`copied from ${dist}`);
  }

  const tag = process.env.GERO_TAG;
  if (tag) {
    for (const a of ASSETS) {
      const url = releaseUrl(tag, a.name);
      const response = await fetch(url);
      if (!response.ok) {
        // `book.json` is new; older tags carry the module without it.
        if (a.name === "book.json") continue;
        throw new Error(`${url} returned ${response.status}`);
      }
      await writeFile(join(publicDir, a.name), Buffer.from(await response.arrayBuffer()));
    }
    return report(`fetched ${tag}`);
  }

  const checkout = geroRoot();
  if (existsSync(join(checkout, ASSETS[0].built))) {
    for (const a of ASSETS) {
      const built = join(checkout, a.built);
      if (existsSync(built)) {
        await copyFile(built, join(publicDir, a.name));
      } else if (a.name === "book.json") {
        await packBook(join(checkout, "docs/book"), join(publicDir, "book.json"));
      } else {
        throw new Error(`missing ${built}`);
      }
    }
    return report(`copied from the gero checkout at ${checkout}`);
  }

  throw new Error(
    `no gero.wasm under ${checkout}. Run \`zig build wasm\` there, or set ` +
      "GERO_ROOT to another checkout, GERO_DIST to a directory holding both " +
      "assets, or GERO_TAG to a gero release.",
  );
}

/** Pack `docs/book/*.md` the same way gero's `emit-book.mjs` does, so a
 *  checkout whose wasm step predates that script still feeds the lab. */
async function packBook(bookDir, dest) {
  if (!existsSync(bookDir)) {
    throw new Error(`no book at ${bookDir}`);
  }
  const files = (await readdir(bookDir))
    .filter((n) => n.endsWith(".md"))
    .toSorted((a, b) => {
      if (a === "README.md") return -1;
      if (b === "README.md") return 1;
      return a.localeCompare(b);
    });
  const chapters = [];
  for (const name of files) {
    const body = await readFile(join(bookDir, name), "utf8");
    const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(name, ".md");
    chapters.push({
      slug: name === "README.md" ? "" : basename(name, ".md"),
      title: heading,
      file: name,
      body,
    });
  }
  await writeFile(dest, JSON.stringify({ version: 1, title: "The Gero Book", chapters }, null, 2));
}

function report(how) {
  const grammars = GRAMMARS.map((g) => g.wasm).join(", ");
  process.stdout.write(`${ASSETS.map((a) => a.name).join(", ")} → public/ (${how})\n`);
  process.stdout.write(`${grammars} → public/ (pinned grammar releases)\n`);
}

main().catch((err) => {
  process.stderr.write(`fetch-assets: ${err.message}\n`);
  process.exit(1);
});
