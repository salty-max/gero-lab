/**
 * The program being edited, and building it.
 *
 * The source application assembled synchronously through `@gero/asm`.
 * Building now goes to the worker and comes back as events, so
 * `build()` is a promise — the one shape change the components see.
 *
 * Everything a build produces originates in `gero.wasm`: the image, the
 * diagnostics in the CLI's own wording, the disassembly, and the debug
 * tables (§11).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useVM } from "./vm-context";
import { decodeShareUrl } from "@/share";
import { Persistence, browserStore } from "@/state/storage";
import { NO_DEBUG_INFO, parseDebugInfo, type DebugInfo } from "@/worker/debug";
import type { Diagnostic, Lang, SourceFile } from "@/worker/protocol";

/** What one build produced. */
export type ProgramBuild = {
  image: Uint8Array;
  /** The CLI's own codes and wording (§5). */
  diagnostics: Diagnostic[];
  /** Annotated assembly, one instruction per line, addresses included. */
  disassembly: string;
  debug: DebugInfo;
};

export type ProgramApi = {
  files: SourceFile[];
  entryName: string;
  lang: Lang;
  /** Bumped on every edit, for consumers that re-derive from source. */
  sourceVersion: number;
  getSource(name?: string): string;
  setSource(text: string, name?: string): void;
  openFile(name: string): void;
  openName: string;
  setProgram(files: SourceFile[], entryName: string, lang: Lang): void;

  build(): Promise<ProgramBuild>;
  lastBuild: ProgramBuild | null;
  building: boolean;
  /** The CPU address the image's first byte sits at. The base image is
   *  absolute, so the disassembly's own addresses are the truth. */
  programBase: number;
  /** Where the VM booted to, from the snapshot after a load. */
  entry: number;
};

const ProgramContext = createContext<ProgramApi | null>(null);

export function ProgramProvider({ children }: { children: ReactNode }) {
  const vm = useVM();
  const { build: buildInWorker } = vm;
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [entryName, setEntryName] = useState("main.gas");
  const [lang, setLang] = useState<Lang>("gas");
  const [openName, setOpenName] = useState("main.gas");
  const [sourceVersion, setSourceVersion] = useState(0);
  const [lastBuild, setLastBuild] = useState<ProgramBuild | null>(null);
  const [building, setBuilding] = useState(false);
  const persistence = useMemo(() => new Persistence(browserStore()), []);
  /** Set once the restore has run, so the first render does not save an
   *  empty set over what was stored. */
  const restored = useRef(false);

  /**
   * Where the program comes from: a shared link, then the last
   * session's buffers (§7, §8).
   *
   * A link is the most specific thing the user asked for, so it wins —
   * and its payload leaves the address bar once taken, or a reload
   * would re-open the sender's program over whatever has been edited
   * since.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const shared = await decodeShareUrl(globalThis.location.href).catch(() => null);
      if (!live) return;
      if (shared) {
        setFiles(shared.files);
        setEntryName(shared.entry);
        setLang(shared.lang);
        setOpenName(shared.entry);
        const { pathname, search } = globalThis.location;
        globalThis.history.replaceState(null, "", `${pathname}${search}`);
      } else {
        const stored = persistence.loadWorkingSet();
        if (stored) {
          setFiles(stored.files);
          setEntryName(stored.entry);
          setLang(stored.lang);
          setOpenName(stored.open);
        }
      }
      restored.current = true;
    })();
    return () => {
      live = false;
    };
  }, [persistence]);

  // Saved on every edit: losing a tab must not lose work (§7).
  useEffect(() => {
    if (!restored.current || files.length === 0) return;
    persistence.saveWorkingSet({ sample: entryName, entry: entryName, lang, files, open: openName });
  }, [files, entryName, lang, openName, persistence]);

  const getSource = useCallback(
    (name?: string) => files.find((f) => f.name === (name ?? openName))?.text ?? "",
    [files, openName],
  );

  const setSource = useCallback(
    (text: string, name?: string) => {
      const target = name ?? openName;
      setFiles((prev) => prev.map((f) => (f.name === target ? { ...f, text } : f)));
      setSourceVersion((v) => v + 1);
    },
    [openName],
  );

  const setProgram = useCallback((next: SourceFile[], entry: string, nextLang: Lang) => {
    setFiles(next);
    setEntryName(entry);
    setLang(nextLang);
    setOpenName(entry);
    setSourceVersion((v) => v + 1);
  }, []);

  /**
   * Build the file set and load what comes out.
   *
   * The worker loads a successful build itself, so there is no separate
   * load step for the UI to forget — a build that left the VM holding
   * the previous image would run the wrong program.
   */
  const build = useCallback(async (): Promise<ProgramBuild> => {
    setBuilding(true);
    try {
      const result = await buildInWorker(files, entryName, lang);
      const out: ProgramBuild = {
        image: result.image ?? new Uint8Array(0),
        diagnostics: result.diagnostics,
        disassembly: result.disassembly,
        debug: result.debugJson ? parseDebugInfo(result.debugJson) : NO_DEBUG_INFO,
      };
      setLastBuild(out);
      if (out.image.length > 0) {
        const saved = persistence.loadSram(entryName);
        if (saved) vm.writeSram(saved);
      }
      return out;
    } finally {
      setBuilding(false);
    }
  }, [buildInWorker, files, entryName, lang, persistence, vm]);

  const api: ProgramApi = useMemo(
    () => ({
      files,
      entryName,
      lang,
      sourceVersion,
      getSource,
      setSource,
      openFile: setOpenName,
      openName,
      setProgram,
      build,
      lastBuild,
      building,
      programBase: 0,
      entry: vm.snap?.ip ?? 0,
    }),
    [
      files,
      entryName,
      lang,
      sourceVersion,
      getSource,
      setSource,
      openName,
      setProgram,
      build,
      lastBuild,
      building,
      vm.snap?.ip,
    ],
  );

  return <ProgramContext.Provider value={api}>{children}</ProgramContext.Provider>;
}

export function useProgram(): ProgramApi {
  const ctx = useContext(ProgramContext);
  if (!ctx) throw new Error("useProgram must be used within <ProgramProvider>");
  return ctx;
}
