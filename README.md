# gero-lab

Browser playground for the [Gero VM](https://github.com/salty-max/gero).
The application half of
[`docs/gero-lab.md`](https://github.com/salty-max/gero/blob/main/docs/gero-lab.md);
the wasm module it drives lives in the gero repository.

## The one rule

**No toolchain or VM logic lives here.** Every assemble, compile,
format, disassemble and step goes through `gero.wasm`. A prior
TypeScript implementation of the VM drifted to a different `ret`
encoding than the ISA and silently stopped running current programs —
§11 of the spec exists because of that, and this repository is arranged
so it cannot happen again.

The module is fetched, never vendored. `public/gero.wasm` is gitignored:
a checked-in copy is a module that can lag the toolchain it exposes.

## Layers

```
UI (main thread)  ──worker protocol──  Engine worker  ──wasm exports──  gero.wasm
```

Two boundaries, each versioned and testable on its own.

| | Owns | Versioned by |
|---|---|---|
| `src/worker/client.ts` | Nothing but messages | `PROTOCOL_VERSION` |
| `src/worker/engine.ts` | The VM session and the run loop | — |
| `src/worker/module.ts` | The arena and the `Result` encoding | the module's own `Result` shape |

The UI refuses to connect to a worker whose protocol it does not
recognize, which turns a stale service-worker cache — the classic way a
deployed web app breaks after a release — into one clear error rather
than a UI wired to a worker that means something different by the same
message.

## The run loop

`run` executes in slices: a fixed instruction budget per turn, yielding
between them so `pause` is honoured promptly and a tight `while` in a
user program cannot freeze the page.

Events **coalesce per slice** — at most one `output` and one `trace`,
whatever the program did inside it. A program printing in a tight loop
therefore produces a bounded event rate however fast it runs, which is
the difference between a responsive UI and a page that dies under its
own message queue.

`pause` lands at a slice boundary rather than mid-slice, so state the UI
reads is never mid-instruction.

## Develop

```bash
npm install
npm run wasm          # place gero.wasm in public/
npm test              # the engine, against the real module
npm run lint
npm run typecheck
npm run dev
```

`npm run wasm` takes the module from a sibling gero checkout's
`zig-out` by default — the working-tree module, which is what you want
while developing against an unreleased toolchain. `GERO_WASM=<path>`
and `GERO_TAG=<tag>` override that.

## Testing

The engine tests drive the **real** `gero.wasm`. Nothing here mocks the
module: a mocked VM is a second implementation of the thing §11 exists
to prevent, and it would agree with whatever the test author believed
rather than with the ISA.

CI checks out gero, runs `zig build wasm`, and tests against that — so a
change to the ISA that this application has not caught up with fails
here rather than in a browser.

## License

MIT.
