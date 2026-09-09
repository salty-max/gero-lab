/**
 * Programs as links (gero-lab.md §8).
 *
 * A link carries the compressed source set and its entry point — not a
 * `.gx`. The link stays readable, and the recipient assembles with
 * their own toolchain version rather than running an opaque blob from a
 * stranger.
 *
 * It carries nothing else. Breakpoints, pane layout and theme are the
 * sender's, and someone opening a link should get the program rather
 * than the sender's session (§7).
 *
 * Self-contained: the payload lives in the URL fragment, which no
 * browser sends to a server, so opening a link fetches nothing.
 */

import type { Lang, SourceFile } from "@/worker/protocol";

/** What a link carries, and all it carries. */
export interface SharedProgram {
  files: SourceFile[];
  entry: string;
  lang: Lang;
}

/** The fragment key, so a link reads as what it is. */
const FRAGMENT_KEY = "p";

/**
 * The longest URL this will produce.
 *
 * 8192 is what mainstream browsers and servers accept; the ceiling that
 * actually bites is usually a chat client or a mail gateway rewriting a
 * longer one. A link that arrives truncated half-loads a program, which
 * is worse than one that was refused (§8) — so this refuses.
 */
export const MAX_SHARE_URL_LENGTH = 8192;

/** Thrown when the program will not fit in a URL. Carries the lengths
 *  so the message can say by how much. */
export class ShareTooLongError extends Error {
  constructor(
    readonly length: number,
    readonly limit: number,
  ) {
    super(
      `this program needs a ${String(length)}-character link, past the ${String(limit)}-character limit — download it instead`,
    );
    this.name = "ShareTooLongError";
  }
}

/** Thrown when a link's payload is not one this build can read. */
export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareDecodeError";
  }
}

/** Encode a program into a shareable URL.
 *
 *  Rejects with `ShareTooLongError` rather than returning a truncated
 *  link. */
export async function encodeShareUrl(
  program: SharedProgram,
  base: string,
): Promise<string> {
  const json = JSON.stringify(program);
  const packed = await deflate(new TextEncoder().encode(json));
  const url = `${stripFragment(base)}#${FRAGMENT_KEY}=${toBase64Url(packed)}`;
  if (url.length > MAX_SHARE_URL_LENGTH) {
    throw new ShareTooLongError(url.length, MAX_SHARE_URL_LENGTH);
  }
  return url;
}

/** Read a program out of a URL, or null when it carries none.
 *
 *  A malformed payload raises rather than returning null: "no link
 *  here" and "this link is broken" want different words. */
export async function decodeShareUrl(url: string): Promise<SharedProgram | null> {
  const fragment = url.slice(url.indexOf("#") + 1);
  if (!url.includes("#")) return null;
  const payload = new URLSearchParams(fragment).get(FRAGMENT_KEY);
  if (!payload) return null;

  let json: string;
  try {
    json = new TextDecoder().decode(await inflate(fromBase64Url(payload)));
  } catch {
    throw new ShareDecodeError("this link's program could not be read");
  }

  const parsed: unknown = JSON.parse(json);
  if (!isSharedProgram(parsed)) {
    throw new ShareDecodeError("this link does not carry a program this build understands");
  }
  return parsed;
}

function isSharedProgram(value: unknown): value is SharedProgram {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<SharedProgram>;
  return (
    Array.isArray(p.files) &&
    p.files.length > 0 &&
    p.files.every((f) => typeof f.name === "string" && typeof f.text === "string") &&
    typeof p.entry === "string" &&
    (p.lang === "gas" || p.lang === "gr")
  );
}

/** Everything before the fragment, so re-sharing a shared link does not
 *  nest one payload inside another. */
function stripFragment(url: string): string {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

// `deflate-raw` rather than `gzip`: the same compressor without the
// 18-byte header and trailer, which is real weight against a URL limit.
const FORMAT = "deflate-raw";

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return collect(streamThrough(bytes, new CompressionStream(FORMAT)));
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return collect(streamThrough(bytes, new DecompressionStream(FORMAT)));
}

function streamThrough(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): ReadableStream<Uint8Array> {
  return new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Base64url: the URL-safe alphabet, unpadded. `+` and `/` would need
 *  escaping in a fragment, and `=` is noise a decoder can infer. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (c) => c.codePointAt(0) ?? 0);
}
