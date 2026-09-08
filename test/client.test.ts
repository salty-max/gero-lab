/**
 * The UI's side of the boundary: the protocol check, and nothing else.
 *
 * Driven with a fake worker rather than a real one. That is not a
 * second implementation of anything — the worker's behaviour is covered
 * in `engine.test.ts` against the real module; what is under test here
 * is the client's refusal to proceed past a version it does not speak.
 */

import { describe, expect, it } from "vitest";

import { EngineClient, type WorkerLike } from "../src/worker/client.js";
import { PROTOCOL_VERSION, ProtocolMismatchError, type Command, type Event } from "../src/worker/protocol.js";

/** A worker that answers `init` with whatever `ready` it is given. */
function fakeWorker(ready: Event): { worker: WorkerLike; sent: Command[] } {
  const listeners: ((e: MessageEvent<Event>) => void)[] = [];
  const sent: Command[] = [];
  const worker: WorkerLike = {
    postMessage(command) {
      sent.push(command);
      if (command.type === "init") {
        queueMicrotask(() => {
          for (const l of listeners) l({ data: ready } as MessageEvent<Event>);
        });
      }
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
  };
  return { worker, sent };
}

describe("EngineClient", () => {
  it("connects when the worker speaks the same protocol", async () => {
    const { worker } = fakeWorker({ type: "ready", protocol: PROTOCOL_VERSION, version: "0.2.0" });
    await expect(new EngineClient(worker).connect()).resolves.toBe("0.2.0");
  });

  it("refuses a worker speaking a protocol it does not know", async () => {
    // The stale-cache case: the page reloaded but the service worker
    // served the previous build's worker.
    const { worker } = fakeWorker({ type: "ready", protocol: PROTOCOL_VERSION + 1, version: "0.2.0" });
    await expect(new EngineClient(worker).connect()).rejects.toBeInstanceOf(ProtocolMismatchError);
  });

  it("names both versions so the message says which side is stale", async () => {
    const { worker } = fakeWorker({ type: "ready", protocol: 99, version: "0.2.0" });
    const error = await new EngineClient(worker)
      .connect()
      .then(() => null, (err: unknown) => err);

    expect(error).toBeInstanceOf(ProtocolMismatchError);
    const mismatch = error as ProtocolMismatchError;
    expect(mismatch.actual).toBe(99);
    expect(mismatch.expected).toBe(PROTOCOL_VERSION);
    expect(mismatch.message).toContain("99");
  });

  it("connects once however many callers ask", async () => {
    const { worker, sent } = fakeWorker({ type: "ready", protocol: PROTOCOL_VERSION, version: "0.2.0" });
    const client = new EngineClient(worker);
    await Promise.all([client.connect(), client.connect(), client.connect()]);
    expect(sent.filter((c) => c.type === "init")).toHaveLength(1);
  });

  it("routes events to type listeners and to the wildcard", async () => {
    const { worker } = fakeWorker({ type: "ready", protocol: PROTOCOL_VERSION, version: "0.2.0" });
    const client = new EngineClient(worker);
    const seen: string[] = [];
    client.on("ready", () => seen.push("typed"));
    client.on("*", (e) => seen.push(`any:${e.type}`));
    await client.connect();
    expect(seen).toEqual(["typed", "any:ready"]);
  });

  it("stops delivering to a listener that unsubscribed", async () => {
    const { worker } = fakeWorker({ type: "ready", protocol: PROTOCOL_VERSION, version: "0.2.0" });
    const client = new EngineClient(worker);
    let count = 0;
    const off = client.on("ready", () => count++);
    off();
    await client.connect();
    expect(count).toBe(0);
  });
});
