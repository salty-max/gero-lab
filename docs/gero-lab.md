# gero-lab — Browser Playground Spec

The web playground for the Gero toolchain: write `.gas` or `.gr` in the
browser, assemble or compile it, and run it on the Gero VM with a full
debugger cockpit — registers, memory, stack, disassembly, breakpoints,
single-step.

This describes the **application**. Everything it stands on — the
exports, who owns which bytes, what `gero_check` returns — is the
module contract, and lives in
[`gero/docs/wasm.md`](https://github.com/salty-max/gero/blob/main/docs/wasm.md).
This file does not restate any of it: a rule written twice is a rule
that will eventually disagree with itself. Where the two meet, this
one cites.

gero-lab is a **toolchain cockpit**, not a game runtime. The
peripherals — display, audio, input — belong to
[gtx-16](https://github.com/salty-max/gero/blob/main/docs/gtx-16.md),
a separate consumer of the same VM.

---

## 1. Layers

Three layers, two boundaries. Each boundary is a contract that can be
versioned and tested independently.

```
┌─────────────────────────────────────────────┐
│  UI (main thread)                           │
│  editor · panes · transport controls        │
└───────────────┬─────────────────────────────┘
                │  worker protocol (§2)
┌───────────────┴─────────────────────────────┐
│  Engine worker                              │
│  session state · run loop · event batching  │
└───────────────┬─────────────────────────────┘
                │  wasm exports (wasm.md §2)
┌───────────────┴─────────────────────────────┐
│  gero.wasm                                  │
│  asm · lang · vm · disasm                   │
└─────────────────────────────────────────────┘
```

The UI never touches the wasm module directly. The worker owns the VM
instance and every allocation inside the module; the UI owns nothing
but plain serializable messages. This keeps the run loop off the main
thread, so a tight `while` loop in a user program cannot freeze the
page.

The lower boundary is also where the repositories divide: `gero.wasm`
is built and gated in the gero repository, the two layers above it live
with the application. [`wasm.md`](https://github.com/salty-max/gero/blob/main/docs/wasm.md) §9.1 says why.

---

---

## 2. Worker protocol

A versioned message protocol over comlink. `PROTOCOL_VERSION` is a
single integer; the UI refuses to connect to a worker whose version it
doesn't recognize, which turns a stale service-worker cache into a
clear error instead of silent misbehavior.

### 2.1 Commands

| Command | Payload |
|---|---|
| `init` | memory size, entry override |
| `build` | source set + entry file + language |
| `load` | `.gx` bytes (skips the toolchain — for a shared image) |
| `reset` | — |
| `run` | starting `ip` |
| `pause` | — |
| `step` | instruction count |
| `breakpoints` | add / remove address lists |
| `peek` | address, length, request id |
| `poke` | address, bytes |
| `setReg` | register, value |
| `irq` | vector |

### 2.2 Events

| Event | Payload |
|---|---|
| `ready` | protocol version, gero version |
| `built` | `.gx` size, entry, debug info (§4), diagnostics |
| `paused` | reason (`breakpoint` / `manual` / `fault` / `halt`), `ip`, fault detail |
| `snapshot` | register file |
| `mem` | address, bytes, request id |
| `output` | text drained from the print buffer |
| `trace` | `ip`, before / after snapshots |
| `irq` | phase (`enter` / `exit`), `ip` |
| `bp` | added / removed / total |

The run loop the worker drives — how much the module executes per
call, and why it hands control back — is the module's behaviour, not
the application's: [`wasm.md`](https://github.com/salty-max/gero/blob/main/docs/wasm.md) §4.

---

## 3. Highlighting

The editor colours source with the **same tree-sitter grammars the
native editors use**, loaded in the browser through
[`web-tree-sitter`](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web):

| Language | Grammar | Artifact |
|---|---|---|
| `.gas` | [`tree-sitter-gero-asm`](https://github.com/salty-max/tree-sitter-gero-asm) | `tree-sitter-gero_asm.wasm` |
| `.gr` | [`tree-sitter-gero-lang`](https://github.com/salty-max/tree-sitter-gero-lang) | `tree-sitter-gero_lang.wasm` |

Each grammar builds that artifact in CI on tag and attaches it to the
release, so the lab fetches a versioned file rather than compiling a
grammar it cannot compile:

```
https://github.com/salty-max/tree-sitter-<name>/releases/download/<tag>/tree-sitter-<name>.wasm
```

The `queries/highlights.scm` shipped alongside each grammar is the
lab's theme mapping too. Editors and the lab therefore colour the same
token the same way by construction, not by two teams agreeing.

**Why not a CodeMirror or Monaco mode.** A hand-written mode is a
second grammar, and it drifts — the failure §7 records for the VM,
in a smaller place. The lab holds no token table for the same reason it
holds no opcode table.

**Why not semantic tokens.** They would come from the wasm module and
so could not drift, but they need the symbol table [`lsp.md`](https://github.com/salty-max/gero/blob/main/docs/lsp.md) §6
gates hover and go-to-definition on. Highlighting does not need to wait
for that, and a grammar answers it better regardless: it colours a
buffer that does not compile, which is most buffers most of the time.

**A language with no grammar renders as plain text.** That is the only
fallback. It is not a licence to write a mode for the gap — the gap is
closed by publishing a grammar, and both languages have one.

**Build order.** The lab's highlighting depends on a tagged grammar
release carrying its `.wasm`. Both do from `tree-sitter-gero-asm`
v0.3.1 and `tree-sitter-gero-lang` v0.1.1 onward; earlier tags carry
the grammar but no browser artifact.

---

---

## 4. Consuming diagnostics and debug information

The *shape* of what `gero_check` and `gero_debug_info` return is the
module contract — [`wasm.md`](https://github.com/salty-max/gero/blob/main/docs/wasm.md) §6 and §7. What the cockpit does with
them is here.

A diagnostic is rendered against the file it names, which is why the
file set is addressed by key rather than by path: the editor holds the
same keys the module was given. A diagnostic with no span still
renders, attached to the file rather than to a line.

Debug information drives the source-level view: the line table maps an
address to a line, so stepping highlights source rather than
disassembly, and a breakpoint set on a line resolves to the address
that line begins at. A program built without a debug section still
runs — the cockpit falls back to disassembly, and says so rather than
showing an empty pane.

---

## 5. Persistence

Three kinds of state, three lifetimes:

- **Source buffers** — the working set, saved to browser storage on
  edit and restored on load. Losing a tab must not lose work.
- **SRAM** — a program's `.sav` banks, exposed through
  `gero_vm_sram`. Stored per program identity so a cart's saved game
  survives a reload, matching what the CLI writes to a `.sav` file.
- **Session state** — breakpoints, pane layout, speed, theme. Local
  to the browser; never part of a shared link.

---

## 6. Sharing

A program shares as a URL carrying the compressed source set and entry
point — not a `.gx`. Sharing source means the link stays readable, and
the recipient assembles with their own toolchain version rather than
running an opaque blob from a stranger.

Links are self-contained: no server, no stored state, no account. A
shared link that exceeds a practical URL length is refused with a
message suggesting file download instead of silently truncating.

---

---

## 7. What gero-lab explicitly does NOT do

These absences are deliberate.

- **No peripherals.** No display, audio, or input. That is gtx-16's
  layer; a lab that grew a framebuffer would become a second, worse
  console.
- **No server.** No accounts, no stored programs, no build queue.
  Everything runs in the browser; sharing is a URL.
- **No second implementation.** Every toolchain and VM operation goes
  through the wasm module. The lab holds no opcode table, no
  instruction semantics, no assembler. A prior TypeScript
  implementation demonstrated the failure mode: it drifted to a
  different `ret` encoding than the ISA and silently stopped being
  able to run current programs.
- **No editing of `.gx` bytes.** The lab is a source-level tool.
  Memory poking during a session is a debugger affordance, not an
  image editor.
- **No network fetches at build time.** Imports resolve within the
  session's file set.

---

---

## 8. Why this shape

**Why a worker rather than the main thread?** A user program is
arbitrary code, including an infinite loop. On the main thread that
hangs the page and loses the user's source. In a worker it is a
`pause` away from recovery.

**Why `brk` rather than an address set?** Address comparison costs
something on every instruction, forever, to support a feature used
rarely. Patching costs something once per breakpoint toggle. The ISA
already defines the opcode and the VM already reports it.

**Why compile in the browser rather than on a server?** The toolchain
is a few hundred kilobytes of wasm and runs in milliseconds. A server
would add latency, an availability dependency, and an attack surface,
to do work the client can do locally.

**Why share source rather than images?** A `.gx` is opaque and
version-bound. Source is readable, diffable, and rebuilt by the
recipient's toolchain — so a shared link keeps working across format
changes that would invalidate a blob.

**Why both languages from the start?** The lang compiler is the
larger half of the project. A playground that demonstrates only the
assembler would misrepresent what Gero is, and retrofitting a second
language into a UI built around one is more work than accommodating
both from the beginning.
