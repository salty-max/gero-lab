/**
 * The two things the browser keeps that are not source (§7).
 *
 * **Breakpoints** are session state: restored into the worker on load,
 * saved on change, and never part of a shared link.
 *
 * **SRAM** is a program's battery-backed banks, kept per program
 * identity so a cart's saved game survives a reload and a different
 * program does not see it.
 */

import { useEffect, useRef } from "react";

import type { Session } from "@/state/session";
import type { Persistence } from "@/state/storage";

export function usePersistedSession(
  session: Session,
  entry: string | null,
  persistence: Persistence,
): void {
  const { setBreakpoints, readSram } = session;
  /** Restoring writes the breakpoints back, which looks exactly like
   *  the user setting them — this is what tells the two apart. */
  const restored = useRef(false);

  useEffect(() => {
    if (session.phase === "connecting" || restored.current) return;
    const stored = persistence.loadSession();
    if (stored.breakpoints.length > 0) setBreakpoints(stored.breakpoints);
    restored.current = true;
  }, [session.phase, setBreakpoints, persistence]);

  useEffect(() => {
    if (!restored.current) return;
    persistence.saveSession({ breakpoints: session.breakpoints });
  }, [session.breakpoints, persistence]);

  // A program writes its banks as it runs, so they are read back
  // wherever it stops — a halt, a breakpoint, a manual pause.
  useEffect(() => {
    if (session.pause) readSram();
  }, [session.pause, readSram]);

  useEffect(() => {
    if (entry === null || session.sram.length === 0) return;
    persistence.saveSram(entry, session.sram);
  }, [session.sram, entry, persistence]);
}
