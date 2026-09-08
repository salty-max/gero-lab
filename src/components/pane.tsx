/**
 * The frame every cockpit pane sits in, and the pieces they all use.
 *
 * A pane is a card with a title bar, a slot for its own controls, and a
 * body that scrolls on its own — the cockpit is a fixed-height grid, so
 * a pane that grew with its content would push the rest off screen.
 */

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function Pane({
  title,
  action,
  children,
  className,
}: {
  title: string;
  /** The pane's own controls, on the title bar's trailing edge. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      size="sm"
      className={cn("min-h-0 gap-0 py-0", className)}
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h2>
        {action}
      </div>
      <ScrollArea className="min-h-0 flex-1">{children}</ScrollArea>
    </Card>
  );
}

/** A machine word in hex, in the width the machine uses.
 *
 *  Tabular so a column of them lines up rather than shimmering as the
 *  values change under a running program. */
export function Hex({ value, bytes = 2 }: { value: number; bytes?: 1 | 2 }) {
  return (
    <span className="font-mono tabular-nums">
      ${value.toString(16).toUpperCase().padStart(bytes * 2, "0")}
    </span>
  );
}

/** What a pane says before it has anything to show. */
export function PaneEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-4 text-xs text-muted-foreground">{children}</p>;
}
