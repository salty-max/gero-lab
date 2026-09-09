/**
 * What the browser keeps, and for how long (gero-lab.md §7).
 *
 * Three kinds of state with three lifetimes:
 *
 * - **The working set** — the buffers being edited. Losing a tab must
 *   not lose work; that is the whole requirement.
 * - **SRAM** — a program's battery-backed banks, per program identity,
 *   so a cart's saved game survives a reload.
 * - **Session state** — breakpoints and which file is open. Local to
 *   this browser, and never part of a shared link (§8).
 *
 * Every read tolerates absent or unreadable data: storage can be full,
 * disabled, or hold something an older build wrote, and none of those
 * is a reason for the lab not to open.
 */

import type { Lang, SourceFile } from "@/worker/protocol";

/** The slice of `localStorage` this needs, so a test can pass a map. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The buffers being edited, and which sample they came from. */
export interface WorkingSet {
  sample: string;
  entry: string;
  lang: Lang;
  files: SourceFile[];
  open: string;
}

/** What is local to this browser and stays out of a link. */
export interface PersistedSession {
  breakpoints: number[];
}

const KEYS = {
  workingSet: "gero-lab:working-set",
  session: "gero-lab:session",
  /** SRAM is per program, so its key carries the program's identity. */
  sram: (program: string) => `gero-lab:sram:${program}`,
} as const;

/**
 * A program's identity for SRAM purposes: its entry point's name.
 *
 * The CLI writes `<entry>.sav` beside the program, and keying on the
 * same thing gives the same behaviour — a save survives editing the
 * program, which is the point of a save. Keying on the source's
 * contents would orphan it on every keystroke.
 */
export const programIdentity = (entry: string): string => entry;

export class Persistence {
  constructor(private readonly store: KeyValueStore) {}

  loadWorkingSet(): WorkingSet | null {
    return this.read(KEYS.workingSet, isWorkingSet);
  }

  saveWorkingSet(set: WorkingSet): void {
    this.write(KEYS.workingSet, set);
  }

  loadSession(): PersistedSession {
    return this.read(KEYS.session, isPersistedSession) ?? { breakpoints: [] };
  }

  saveSession(state: PersistedSession): void {
    this.write(KEYS.session, state);
  }

  /** Banks saved by an earlier session of the same program. */
  loadSram(entry: string): Uint8Array | null {
    const raw = this.store.getItem(KEYS.sram(programIdentity(entry)));
    if (raw === null) return null;
    try {
      return Uint8Array.from(atob(raw), (c) => c.codePointAt(0) ?? 0);
    } catch {
      return null;
    }
  }

  /** Store banks under this program's identity.
   *
   *  A program declaring no SRAM has nothing to keep, and writing an
   *  empty entry would leave a key behind that reads as a save. */
  saveSram(entry: string, bytes: Uint8Array): void {
    const key = KEYS.sram(programIdentity(entry));
    if (bytes.length === 0) {
      this.store.removeItem(key);
      return;
    }
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    this.tolerate(() => {
      this.store.setItem(key, btoa(binary));
    });
  }

  private read<T>(key: string, guard: (value: unknown) => value is T): T | null {
    const raw = this.store.getItem(key);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return guard(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    this.tolerate(() => {
      this.store.setItem(key, JSON.stringify(value));
    });
  }

  /** A full or disabled store must not take the lab down with it: the
   *  work in front of the user is still there, it just will not
   *  survive the tab. */
  private tolerate(write: () => void): void {
    try {
      write();
    } catch {
      // Storage refused. Nothing here can act on that.
    }
  }
}

/** `localStorage`, or a store that keeps nothing when the browser
 *  refuses one — private windows and blocked-cookie settings both
 *  throw on access rather than returning null. */
export function browserStore(): KeyValueStore {
  try {
    const probe = "gero-lab:probe";
    globalThis.localStorage.setItem(probe, "1");
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
  }
}

function isSourceFiles(value: unknown): value is SourceFile[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (f: unknown) =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as SourceFile).name === "string" &&
        typeof (f as SourceFile).text === "string",
    )
  );
}

function isWorkingSet(value: unknown): value is WorkingSet {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Partial<WorkingSet>;
  return (
    typeof w.sample === "string" &&
    typeof w.entry === "string" &&
    (w.lang === "gas" || w.lang === "gr") &&
    typeof w.open === "string" &&
    isSourceFiles(w.files)
  );
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<PersistedSession>;
  return Array.isArray(s.breakpoints) && s.breakpoints.every((b) => typeof b === "number");
}
