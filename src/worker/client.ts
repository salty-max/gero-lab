/**
 * The UI's side of the boundary (gero-lab.md §3).
 *
 * Wraps the worker in a typed send/subscribe pair, and refuses to hand
 * out any event until the worker has answered `ready` with a protocol
 * version this build speaks. A stale service-worker cache therefore
 * surfaces as one clear error instead of a UI wired to a worker that
 * means something different by the same message.
 */

import {
  PROTOCOL_VERSION,
  ProtocolMismatchError,
  type Command,
  type Event,
  type EventType,
} from "./protocol.js";

/** The subset of `Worker` this client needs — so a test can drive it
 *  with a pair of in-process ports. */
export interface WorkerLike {
  postMessage(message: Command): void;
  addEventListener(type: "message", listener: (e: MessageEvent<Event>) => void): void;
  terminate?(): void;
}

export type Listener<T extends Event = Event> = (event: T) => void;

export class EngineClient {
  private readonly listeners = new Map<EventType | "*", Set<Listener>>();
  private ready: Promise<string> | null = null;

  constructor(private readonly worker: WorkerLike) {
    this.worker.addEventListener("message", (e) => this.receive(e.data));
  }

  /** Bring the worker up and settle the protocol check.
   *
   *  Rejects with `ProtocolMismatchError` if the worker speaks a
   *  version this build does not — the caller shows that rather than
   *  proceeding, because past this point every message means something
   *  the two sides no longer agree on. */
  connect(arenaBytes?: number): Promise<string> {
    if (this.ready) return this.ready;
    this.ready = new Promise<string>((resolve, reject) => {
      this.once("ready", (event) => {
        if (event.protocol !== PROTOCOL_VERSION) {
          reject(new ProtocolMismatchError(PROTOCOL_VERSION, event.protocol));
          return;
        }
        resolve(event.version);
      });
      this.once("error", (event) => reject(new Error(event.message)));
      this.worker.postMessage({ type: "init", ...(arenaBytes ? { arenaBytes } : {}) });
    });
    return this.ready;
  }

  send(command: Command): void {
    this.worker.postMessage(command);
  }

  /** Subscribe to one event type, or to every event with `"*"`. */
  on<T extends EventType>(type: T, listener: Listener<Extract<Event, { type: T }>>): () => void;
  on(type: "*", listener: Listener): () => void;
  on(type: EventType | "*", listener: Listener): () => void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
    return () => set.delete(listener);
  }

  once<T extends EventType>(type: T, listener: Listener<Extract<Event, { type: T }>>): void {
    const off = this.on(type, ((event: Event) => {
      off();
      (listener as Listener)(event);
    }) as Listener);
  }

  terminate(): void {
    this.worker.terminate?.();
  }

  private receive(event: Event): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    for (const listener of this.listeners.get("*") ?? []) listener(event);
  }
}
