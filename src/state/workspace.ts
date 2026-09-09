/**
 * The working set and what outlives it (gero-lab.md §7, §8).
 *
 * Owns which program is being edited and where it came from: a shared
 * link, the last session's buffers, or the first sample — in that
 * order, because a link the user just opened is the most specific thing
 * they asked for and a restored session is more specific than a
 * default.
 *
 * Kept out of the cockpit so the cockpit stays a view: this is where
 * "losing a tab must not lose work" lives, and it is testable without
 * one.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { loadSamples, type Sample } from "@/samples";
import { decodeShareUrl, encodeShareUrl, type SharedProgram } from "@/share";
import type { Persistence, WorkingSet } from "@/state/storage";
import type { Lang, SourceFile } from "@/worker/protocol";

/** What the editor holds: a program's files, with the edits made to
 *  them, and which one is open. */
export interface Buffer {
  /** The sample it started from, or `link` for one that arrived in a
   *  URL. Names the working set for the user, nothing more. */
  sample: string;
  entry: string;
  lang: Lang;
  files: SourceFile[];
  open: string;
}

export interface Workspace {
  /** Null until the samples and any restored state have loaded. */
  buffer: Buffer | null;
  samples: Sample[];
  /** Set when the samples could not be fetched or a link would not
   *  decode. The cockpit shows this instead of an empty editor. */
  error: string | null;
  chooseSample(sample: Sample): void;
  openFile(name: string): void;
  edit(text: string): void;
}

const fromSample = (sample: Sample): Buffer => ({
  sample: sample.name,
  entry: sample.entry,
  lang: sample.lang,
  files: sample.files,
  open: sample.entry,
});

const fromShared = (program: SharedProgram): Buffer => ({
  sample: "shared link",
  entry: program.entry,
  lang: program.lang,
  files: program.files,
  open: program.entry,
});

const fromStored = (set: WorkingSet): Buffer => ({
  sample: set.sample,
  entry: set.entry,
  lang: set.lang,
  files: set.files,
  open: set.open,
});

/** What a buffer shares, and all it shares — no breakpoints, no
 *  layout, no theme (§8). */
export const sharedFrom = (buffer: Buffer): SharedProgram => ({
  files: buffer.files,
  entry: buffer.entry,
  lang: buffer.lang,
});

/** Encode a buffer as a link against the page's own address. Rejects
 *  with `ShareTooLongError` for a program that will not fit. */
export function shareUrlFor(buffer: Buffer, base = globalThis.location.href): Promise<string> {
  return encodeShareUrl(sharedFrom(buffer), base);
}

/** Take the payload out of the address bar without a navigation. */
function dropFragment(): void {
  const { pathname, search } = globalThis.location;
  globalThis.history.replaceState(null, "", `${pathname}${search}`);
}

export function useWorkspace(persistence: Persistence): Workspace {
  const [buffer, setBuffer] = useState<Buffer | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Set once the restore has run, so the first render's buffer does
   *  not immediately overwrite what was restored. */
  const restored = useRef(false);
  /** The store the restore reads, captured at mount and never
   *  reassigned. The restore runs once for the page: were the store a
   *  dependency, one that changed identity would re-run it over
   *  whatever had been edited since. */
  const store = useRef(persistence);

  useEffect(() => {
    let live = true;
    void (async () => {
      let opened: Buffer | null = null;
      try {
        const shared = await decodeShareUrl(globalThis.location.href);
        if (shared) {
          opened = fromShared(shared);
          // The link has been taken; leaving it in the address bar
          // would mean a reload re-opened the sender's program over
          // whatever has been edited since (§7).
          dropFragment();
        }
      } catch (err: unknown) {
        // A broken link is worth saying out loud, but it must not stop
        // the lab opening on something else.
        setError(err instanceof Error ? err.message : String(err));
      }

      opened ??= (() => {
        const stored = store.current.loadWorkingSet();
        return stored ? fromStored(stored) : null;
      })();

      try {
        const loaded = await loadSamples();
        if (!live) return;
        setSamples(loaded);
        opened ??= loaded[0] ? fromSample(loaded[0]) : null;
      } catch (err: unknown) {
        if (!live) return;
        setError(err instanceof Error ? err.message : String(err));
      }

      if (!live) return;
      setBuffer(opened);
      restored.current = true;
    })();
    return () => {
      live = false;
    };
  }, []);

  // The working set is saved on every edit, which is what makes losing
  // a tab not lose work (§7).
  useEffect(() => {
    if (!restored.current || !buffer) return;
    persistence.saveWorkingSet(buffer);
  }, [buffer, persistence]);

  const chooseSample = useCallback((sample: Sample) => {
    setBuffer(fromSample(sample));
  }, []);

  const openFile = useCallback((name: string) => {
    setBuffer((prev) => (prev === null ? prev : { ...prev, open: name }));
  }, []);

  const edit = useCallback((text: string) => {
    setBuffer((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            files: prev.files.map((f) => (f.name === prev.open ? { ...f, text } : f)),
          },
    );
  }, []);

  return { buffer, samples, error, chooseSample, openFile, edit };
}
