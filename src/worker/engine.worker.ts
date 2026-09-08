/**
 * The worker entry point.
 *
 * A thin adapter: it turns `postMessage` into `Engine` calls and back.
 * Everything with behaviour worth testing lives in `engine.ts`, which
 * is why this file has no logic to test.
 *
 * Commands are serialized through a promise chain rather than handled
 * concurrently. `run` is long-lived and yields between slices, so an
 * unserialized `pause` arriving mid-run would be handled by a second
 * dispatch racing the first — the chain is what makes `pause` land
 * after the slice rather than inside it.
 */

import { Engine } from "./engine.js";
import { GeroModule } from "./module.js";
import type { Command, Event } from "./protocol.js";

const WASM_URL = new URL("/gero.wasm", import.meta.url);

const engine = new Engine(
  (event: Event) => {
    // Transfer the byte payloads rather than copying: a `peek` of a
    // whole bank is 16 KB per request, and the UI does not share them.
    const transfer: Transferable[] = [];
    if (event.type === "mem") transfer.push(event.bytes.buffer);
    if (event.type === "built" && event.image) transfer.push(event.image.buffer);
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

let chain: Promise<void> = Promise.resolve();

self.onmessage = (message: MessageEvent<Command>) => {
  chain = chain.then(() => engine.handle_(message.data));
};
