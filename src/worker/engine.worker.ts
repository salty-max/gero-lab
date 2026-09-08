/**
 * The worker entry point.
 *
 * A thin adapter: it turns `postMessage` into `Engine` calls and back.
 * Everything with behaviour worth testing lives in `engine.ts`, which
 * is why this file has no logic to test.
 *
 * Command ordering is the engine's own concern — it is what knows which
 * commands may overtake a running one — so this file only forwards.
 */

import { Engine } from "./engine.js";
import { GeroModule } from "./module.js";
import type { Command, Event } from "./protocol.js";

const WASM_URL = new URL("/gero.wasm", import.meta.url);

const engine = new Engine(
  (event: Event) => {
    // `mem` is transferred rather than copied: a `peek` of a whole bank
    // is 16 KB per request and the engine never reads it back. The
    // built image is copied instead — the engine goes on to disassemble
    // and load it, and a transfer would detach it mid-build.
    const transfer: Transferable[] = event.type === "mem" ? [event.bytes.buffer] : [];
    self.postMessage(event, transfer);
  },
  async () => {
    const response = await fetch(WASM_URL);
    if (!response.ok) {
      throw new Error(
        `could not fetch the gero wasm module (${response.status}) — ` +
          `run \`npm run wasm\` to place it in public/`,
      );
    }
    return GeroModule.instantiate(await response.arrayBuffer());
  },
);

self.addEventListener("message", (message: MessageEvent<Command>) => {
  void engine.receive(message.data);
});
