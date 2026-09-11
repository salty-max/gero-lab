import { useCallback } from "react";

import { useProgram } from "@/contexts/program-context";
import { useVM } from "@/contexts/vm-context";
import type { Diagnostic, Lang } from "@/worker/protocol";

export type SnippetResult = {
  output: string;
  diagnostics: Diagnostic[];
  halted: boolean;
  timedOut: boolean;
  fault?: string;
};

const RUN_MS = 3000;

function filesFor(code: string, lang: "gero" | "asm"): {
  files: { name: string; text: string }[];
  entry: string;
  vmLang: Lang;
} {
  const text = code.endsWith("\n") ? code : `${code}\n`;
  const entry = lang === "gero" ? "main.gr" : "main.gas";
  return { files: [{ name: entry, text }], entry, vmLang: lang === "gero" ? "gr" : "gas" };
}

/** Build / run a book fence through the same worker the cockpit uses. */
export function useSnippetActions() {
  const program = useProgram();
  const vm = useVM();

  const openInLab = useCallback(
    async (code: string, lang: "gero" | "asm") => {
      const { files, entry, vmLang } = filesFor(code, lang);
      const out = await program.loadProgram(files, entry, vmLang);
      globalThis.location.hash = "/";
      return out;
    },
    [program],
  );

  const runInPlace = useCallback(
    async (code: string, lang: "gero" | "asm"): Promise<SnippetResult> => {
      const { files, entry, vmLang } = filesFor(code, lang);
      const built = await program.loadProgram(files, entry, vmLang);
      if (built.image.length === 0) {
        return {
          output: "",
          diagnostics: built.diagnostics,
          halted: false,
          timedOut: false,
        };
      }

      if (vm.running) {
        await new Promise<void>((resolve) => {
          const off = vm.on("paused", () => {
            off();
            resolve();
          });
          vm.pause();
        });
      }

      const chunks: string[] = [];
      let timedOut = false;
      const result = await new Promise<SnippetResult>((resolve) => {
        const finish = (next: SnippetResult) => {
          offOut();
          offPaused();
          globalThis.clearTimeout(timer);
          resolve(next);
        };
        const offOut = vm.on("output", (ev) => {
          chunks.push(ev.text);
        });
        const offPaused = vm.on("paused", (ev) => {
          finish({
            output: chunks.join(""),
            diagnostics: built.diagnostics,
            halted: ev.reason === "halt",
            timedOut,
            ...(ev.fault ? { fault: ev.fault.msg } : {}),
          });
        });
        const timer = globalThis.setTimeout(() => {
          timedOut = true;
          vm.pause();
        }, RUN_MS);

        const delay = vm.getStepDelay();
        vm.setStepDelay(0);
        vm.run();
        vm.setStepDelay(delay);
      });
      return result;
    },
    [program, vm],
  );

  return { openInLab, runInPlace, ready: vm.ready };
}
