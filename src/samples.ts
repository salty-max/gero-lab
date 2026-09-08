/**
 * The starter programs (gero-lab.md §9).
 *
 * The set is drawn from gero's `examples/` and published beside the
 * module as `samples.json`, so a sample cannot drift from the corpus CI
 * proves works. It is fetched, never vendored — the same rule the
 * module itself follows.
 */

import type { Lang, SourceFile } from "./worker/protocol.js";

/** The manifest shape this build reads. A module whose manifest says
 *  something else is a mismatch worth naming, not one to parse
 *  hopefully. */
const MANIFEST_VERSION = 1;

export interface Sample {
  name: string;
  lang: Lang;
  /** Which of `files` the build starts from. A multi-file sample has
   *  several — `examples/asm/banks` is one program in three. */
  entry: string;
  files: SourceFile[];
}

interface RawSample {
  name: string;
  lang: string;
  entry: string;
  files: Record<string, string>;
}

/** Thrown when the manifest is absent or speaks a version this build
 *  does not know. Both are setup failures with the same fix — refetch
 *  the assets — so they read the same way. */
export class SampleManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SampleManifestError";
  }
}

/** Load the sample set from `public/samples.json`. */
export async function loadSamples(url = "/samples.json"): Promise<Sample[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new SampleManifestError(
      `could not fetch ${url} (${response.status}) — run \`npm run wasm\` to place it in public/`,
    );
  }
  const body: unknown = await response.json();
  return decode(body);
}

function decode(body: unknown): Sample[] {
  const manifest = body as { version?: number; samples?: RawSample[] };
  if (manifest.version !== MANIFEST_VERSION) {
    throw new SampleManifestError(
      `samples.json is version ${String(manifest.version)}, this build reads ${MANIFEST_VERSION}`,
    );
  }
  return (manifest.samples ?? []).map((s) => ({
    name: s.name,
    lang: s.lang === "gr" ? "gr" : "gas",
    entry: s.entry,
    files: Object.entries(s.files).map(([name, text]) => ({ name, text })),
  }));
}
