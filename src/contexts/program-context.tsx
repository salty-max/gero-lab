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
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useVM } from "./vm-context";
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
      return out;
    } finally {
      setBuilding(false);
    }
  }, [buildInWorker, files, entryName, lang]);

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
