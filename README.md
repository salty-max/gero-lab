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
a checked-in copy is a module that can lag the toolchain it exposes. The
same holds for the samples — `public/samples.json` ships beside the
module, drawn from gero's own `examples/`, so a starter program cannot
drift from the corpus CI proves works.

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

## Components

The primitives are vendored with [shadcn](https://ui.shadcn.com) on
**Base UI**, into `src/components/ui/`. `components.json` records the
choice (`"style": "base-nova"`), so adding another is one command:

```bash
npx shadcn@latest add dialog
```

Vendored means they are ours: edit them in place. The theme in
`src/index.css` carries the source application's identity onto shadcn's
tokens — JetBrains Mono, the Red Ribbon `--gero` accent, and four
machine-state colours from Catppuccin Mocha:

| Token | Means |
|---|---|
| `--ip` | Where execution is stopped |
| `--breakpoint` | Where it will stop |
| `--symbol` | What a name binds |
| `--warning` | A warning, as against `--destructive` for an error |

`--ip` rather than `--current`: Tailwind's own `current` keyword means
`currentColor`, and shadowing it would make `text-current` mean two
things.

## The cockpit

The UI reads worker events and nothing else. It does not decode an
instruction, resolve a symbol, or compute a flag — the disassembly text,
the debug tables, and the register file all arrive already formed, so a
pane that shows the wrong thing is a worker bug with one place to fix
it.

| Pane | Shows | From |
|---|---|---|
| Editor | The sample's files, one tab each, with a gutter that turns a line into a breakpoint | the line table |
| Registers | The 15 registers and the flag bits, editable while paused | `snapshot` |
| Disassembly | The annotated listing, the stopped instruction, the breakpoints | `program` |
| Memory | 128 bytes from an address, annotated with the symbols that land in them | `mem` |
| Output | What the program printed | `output` |
| Diagnostics | The CLI's own wording, code, and span | `built` |

Source-level features need the image's debug tables. Without them the
panes degrade to address-level ones and say so, rather than presenting
controls that do nothing.

## What the browser keeps

Three kinds of state, three lifetimes (§7).

| State | Lives in | Lifetime |
|---|---|---|
| The working set | `gero-lab:working-set` | Saved on every edit — losing a tab must not lose work |
| SRAM | `gero-lab:sram:<entry>` | Per program, so a cart's saved game survives a reload and another program does not see it |
| Session state | `gero-lab:session` | Breakpoints. Local to this browser, and never in a link |

SRAM is keyed by the entry point's name because that is what the CLI
keys `<entry>.sav` on: a save survives editing the program, which is the
point of a save. Keying on the source's contents would orphan it on
every keystroke. The module also refuses a save whose length does not
match the loaded program's banks, so a collision cannot land one
program's banks in another.

Storage that is full, disabled, or holding something an older build
wrote is not a reason for the lab not to open: every read falls back and
every write is allowed to fail.

## Sharing

A program shares as a URL carrying the **compressed source set and
entry point — not a `.gx`** (§8). The link stays readable, and the
recipient assembles with their own toolchain version rather than running
an opaque blob from a stranger.

The payload sits in the fragment, which no browser sends to a server, so
opening a link fetches nothing. Compression is `CompressionStream`, so
no library is involved. A program that would exceed
`MAX_SHARE_URL_LENGTH` is **refused** with a download instead — a link
that arrives truncated half-loads a program, which is worse than one
that was refused.

The link is shown as well as copied: the clipboard needs a permission
browsers routinely refuse, and a link built and then thrown away is a
link that cannot be shared.

Opening a link takes the payload out of the address bar. Leaving it
there would mean a reload re-opened the sender's program over whatever
had been edited since.

## Develop

```bash
npm install
npm run wasm          # place gero.wasm and samples.json in public/
npm test              # the engine, against the real module
npm run lint
npm run typecheck
npm run dev
```

`npm run wasm` takes the module and the sample manifest from a sibling
gero checkout's `zig-out` by default — the working-tree module, which is
what you want while developing against an unreleased toolchain.
`GERO_ROOT=<dir>` points at another checkout, `GERO_DIST=<dir>` at a
directory holding both assets, and `GERO_TAG=<tag>` at a gero release.

Lint is [oxlint](https://oxc.rs), configured in `.oxlintrc.json`. It
carries no `typescript` peer of its own, which is what lets the project
run TypeScript 7 — `typescript-eslint` peers `<6.1`, so ESLint and the
current compiler cannot both be installed. It also runs the whole tree
in well under a second, so `npm run lint` belongs in the edit loop
rather than at the end of it.

Type-aware rules would need `oxlint-tsgolint`; nothing here uses one
yet, and adding it is a dependency rather than a config change.

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
