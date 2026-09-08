import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { GeroModule } from "../src/worker/module.js";
import { SampleManifestError, loadSamples } from "../src/samples.js";

/** Serve a manifest to `loadSamples` without a network. */
function serve(body: unknown, ok = true, status = 200) {
  return async (): Promise<Response> =>
    ({ ok, status, json: async () => body }) as Response;
}

const manifest = JSON.parse(await readFile("public/samples.json", "utf8")) as unknown;

describe("loadSamples", () => {
  test("flattens a manifest into files the build command takes", async () => {
    globalThis.fetch = serve(manifest) as typeof fetch;
    const samples = await loadSamples();
    const banks = samples.find((s) => s.name === "banks");
    expect(banks).toBeDefined();
    // A multi-file sample is one entry with several files, and the
    // entry point names which of them the build starts from.
    expect(banks!.files.length).toBeGreaterThan(1);
    expect(banks!.files.map((f) => f.name)).toContain(banks!.entry);
    expect(samples.some((s) => s.lang === "gr")).toBe(true);
  });

  test("a manifest from a newer module is named, not parsed hopefully", async () => {
    globalThis.fetch = serve({ version: 99, samples: [] }) as typeof fetch;
    await expect(loadSamples()).rejects.toBeInstanceOf(SampleManifestError);
  });

  test("an absent manifest says how to place it", async () => {
    globalThis.fetch = serve(null, false, 404) as typeof fetch;
    await expect(loadSamples()).rejects.toThrow(/npm run wasm/);
  });
});

test("every sample builds through the module it ships beside", async () => {
  const mod = await GeroModule.instantiate(await readFile("public/gero.wasm"));
  globalThis.fetch = serve(manifest) as typeof fetch;
  const samples = await loadSamples();
  expect(samples.length).toBeGreaterThan(0);

  // §9: a sample that fails to build is a build failure, not a runtime
  // surprise. The manifest travels with the module, so this is the one
  // check that proves the pair agrees.
  for (const sample of samples) {
    mod.putFiles(sample.files);
    const r = mod.build(sample.entry, sample.lang);
    expect(r.diagnosticsJson, `${sample.name}: ${r.diagnosticsJson ?? ""}`).toBeNull();
    expect(r.payload, sample.name).not.toBeNull();
    // The pane parses an address off each line, so an unannotated
    // disassembly would silently strand every sample.
    expect(mod.disasm(r.payload!), sample.name).toMatch(/^[0-9A-F]{4}:/m);
  }
});
