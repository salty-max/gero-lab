import { describe, expect, it } from "vitest";

import {
  MAX_SHARE_URL_LENGTH,
  ShareDecodeError,
  ShareTooLongError,
  decodeShareUrl,
  encodeShareUrl,
} from "../src/share.js";
import type { SharedProgram } from "../src/share.js";

const BASE = "https://gero-lab.example/";

const BANKS: SharedProgram = {
  entry: "main.gas",
  lang: "gas",
  files: [
    { name: "main.gas", text: "main:\n  mov $0000, mb\n  call greet\n  hlt\n" },
    { name: "bank0.gas", text: "bank $00\ngreet:\n  mov $48, r1\n  int $10\n  ret\n" },
    { name: "bank1.gas", text: "bank $01\nexcite:\n  mov $21, r1\n  int $10\n  ret\n" },
  ],
};

describe("share links", () => {
  it("round-trips a multi-file program with its entry point", async () => {
    const url = await encodeShareUrl(BANKS, BASE);
    expect(await decodeShareUrl(url)).toEqual(BANKS);
  });

  it("carries no breakpoints, layout, speed, or theme", async () => {
    const url = await encodeShareUrl(BANKS, BASE);
    const decoded = await decodeShareUrl(url);

    // §8: someone opening a link should get the program, not the
    // sender's session. The type is the guarantee; this pins it against
    // a field being added to the payload later.
    expect(Object.keys(decoded!).toSorted()).toEqual(["entry", "files", "lang"]);
  });

  it("puts the program in the fragment, which no browser sends to a server", async () => {
    const url = await encodeShareUrl(BANKS, BASE);
    const [before, fragment] = url.split("#");
    expect(before).toBe(BASE);
    expect(fragment).toMatch(/^p=[\w-]+$/);
  });

  it("decodes without a network fetch", async () => {
    const url = await encodeShareUrl(BANKS, BASE);
    const fetching = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("a shared link must not fetch its program");
    };
    try {
      expect(await decodeShareUrl(url)).toEqual(BANKS);
    } finally {
      globalThis.fetch = fetching;
    }
  });

  it("re-sharing a shared link does not nest one payload in another", async () => {
    const once = await encodeShareUrl(BANKS, BASE);
    const twice = await encodeShareUrl(BANKS, once);
    expect(twice).toBe(once);
  });

  it("reads no program out of a URL that carries none", async () => {
    expect(await decodeShareUrl(BASE)).toBeNull();
    expect(await decodeShareUrl(`${BASE}#`)).toBeNull();
    expect(await decodeShareUrl(`${BASE}#other=1`)).toBeNull();
  });

  it("says a link is broken rather than reporting no link", async () => {
    // "There is no program here" and "this one will not open" want
    // different words.
    await expect(decodeShareUrl(`${BASE}#p=not-a-payload`)).rejects.toBeInstanceOf(
      ShareDecodeError,
    );
  });

  it("refuses a payload that decompresses but is not a program", async () => {
    // A link from a build that shaped its payload differently, or one
    // someone hand-made. It decompresses and parses; it is still not a
    // program, and half-loading it would be worse than saying so.
    const packed = await new Response(
      new Blob([new TextEncoder().encode(JSON.stringify({ files: [], entry: 1 }))]).stream()
        .pipeThrough(new CompressionStream("deflate-raw")),
    ).arrayBuffer();
    let binary = "";
    for (const byte of new Uint8Array(packed)) binary += String.fromCharCode(byte);
    const payload = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

    await expect(decodeShareUrl(`${BASE}#p=${payload}`)).rejects.toBeInstanceOf(ShareDecodeError);
  });
});

/** A program of `n` bytes of text that does not compress away — a
 *  repeated comment would, and would never reach the limit. */
function noisyProgram(bytes: number): SharedProgram {
  let text = "";
  for (let i = 0; text.length < bytes; i++) {
    text += `; ${Math.sin(i).toString(36).slice(2)}\n`;
  }
  return { entry: "main.gas", lang: "gas", files: [{ name: "main.gas", text }] };
}

describe("the URL length limit", () => {
  it("refuses an over-long link rather than truncating it", async () => {
    // Tested at the boundary: the largest program that still encodes
    // must encode, and one step past it must be refused.
    let fits = 1000;
    let step = 1000;
    while (step > 0) {
      const candidate = noisyProgram(fits + step);
      const ok = await encodeShareUrl(candidate, BASE).then(
        () => true,
        () => false,
      );
      if (ok) fits += step;
      else step = Math.floor(step / 2);
      if (step === 0) break;
    }

    const largest = await encodeShareUrl(noisyProgram(fits), BASE);
    expect(largest.length).toBeLessThanOrEqual(MAX_SHARE_URL_LENGTH);

    await expect(encodeShareUrl(noisyProgram(fits * 2), BASE)).rejects.toBeInstanceOf(
      ShareTooLongError,
    );
  });

  it("says by how much, and to download instead", async () => {
    const error = await encodeShareUrl(noisyProgram(200_000), BASE).then(
      () => null,
      (err: unknown) => err as ShareTooLongError,
    );
    expect(error).toBeInstanceOf(ShareTooLongError);
    expect(error!.limit).toBe(MAX_SHARE_URL_LENGTH);
    expect(error!.length).toBeGreaterThan(MAX_SHARE_URL_LENGTH);
    expect(error!.message).toContain("download");
  });
});
