/**
 * Place `gero.wasm` in `public/`.
 *
 * The module is never vendored: a checked-in copy is a module that can
 * lag the toolchain it exposes, which is the one direction
 * `docs/gero-lab.md` §10 rules out. It is fetched, and `public/` is
 * gitignored.
 *
 *   GERO_WASM=/path/to/gero.wasm  node scripts/fetch-wasm.mjs
 *   GERO_TAG=v0.3.0               node scripts/fetch-wasm.mjs
 *
 * With neither, a sibling gero checkout's `zig-out` is used — the
 * working-tree module, which is what you want while developing against
 * an unreleased toolchain.
 */

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = resolve(root, "public/gero.wasm");

const RELEASE_URL = (tag) =>
  `https://github.com/salty-max/gero/releases/download/${tag}/gero.wasm`;

/** Where a sibling checkout would have built it. */
const SIBLING = resolve(root, "../gero/zig-out/bin/gero.wasm");

async function main() {
  await mkdir(dirname(dest), { recursive: true });

  const explicit = process.env.GERO_WASM;
  if (explicit) {
    await copyFile(resolve(explicit), dest);
    return report(`copied from ${explicit}`);
  }

  const tag = process.env.GERO_TAG;
  if (tag) {
    const url = RELEASE_URL(tag);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    await writeFile(dest, Buffer.from(await response.arrayBuffer()));
    return report(`fetched ${tag}`);
  }

  if (existsSync(SIBLING)) {
    await copyFile(SIBLING, dest);
    return report("copied from a sibling gero checkout (zig build wasm)");
  }

  throw new Error(
    "no gero.wasm found. Set GERO_WASM to a built module, set GERO_TAG to a " +
      "gero release, or run `zig build wasm` in a sibling gero checkout.",
  );
}

function report(how) {
  process.stdout.write(`gero.wasm → public/gero.wasm (${how})\n`);
}

main().catch((err) => {
  process.stderr.write(`fetch-wasm: ${err.message}\n`);
  process.exit(1);
});
