/**
 * Place the module and its sample manifest in `public/`.
 *
 * Neither is vendored: a checked-in copy is a module that can lag the
 * toolchain it exposes, and a sample set that can drift from the corpus
 * CI proves works. Both are fetched, and `public/` is gitignored
 * (`docs/gero-lab.md` §9, §10).
 *
 *   GERO_DIST=/dir/of/assets  node scripts/fetch-assets.mjs
 *   GERO_ROOT=/path/to/gero   node scripts/fetch-assets.mjs
 *   GERO_TAG=v0.3.0           node scripts/fetch-assets.mjs
 *
 * With none of them, a sibling gero checkout is used — the working-tree
 * module, which is what you want while developing against an unreleased
 * toolchain.
 */

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");

/** What a release publishes as loose assets, and where `zig build wasm`
 *  leaves each one in a checkout. */
const ASSETS = [
  { name: "gero.wasm", built: "zig-out/bin/gero.wasm" },
  { name: "samples.json", built: "zig-out/samples/samples.json" },
];

const releaseUrl = (tag, name) =>
  `https://github.com/salty-max/gero/releases/download/${tag}/${name}`;

/** A gero checkout to take them from, `zig build wasm` already run. */
const geroRoot = () => resolve(root, process.env.GERO_ROOT ?? "../gero");

async function main() {
  await mkdir(publicDir, { recursive: true });

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
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      await writeFile(join(publicDir, a.name), Buffer.from(await response.arrayBuffer()));
    }
    return report(`fetched ${tag}`);
  }

  const checkout = geroRoot();
  if (existsSync(join(checkout, ASSETS[0].built))) {
    for (const a of ASSETS) {
      await copyFile(join(checkout, a.built), join(publicDir, a.name));
    }
    return report(`copied from the gero checkout at ${checkout}`);
  }

  throw new Error(
    `no gero.wasm under ${checkout}. Run \`zig build wasm\` there, or set ` +
      "GERO_ROOT to another checkout, GERO_DIST to a directory holding both " +
      "assets, or GERO_TAG to a gero release.",
  );
}

function report(how) {
  process.stdout.write(`${ASSETS.map((a) => a.name).join(", ")} → public/ (${how})\n`);
}

main().catch((err) => {
  process.stderr.write(`fetch-assets: ${err.message}\n`);
  process.exit(1);
});
