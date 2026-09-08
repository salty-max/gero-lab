/**
 * The handful of primitives the cockpit needs.
 *
 * The source application used shadcn/Radix for these. They are plain
 * Tailwind here: the cockpit uses a button, a card and a scroll region,
 * and the fifteen Radix packages behind the original bought nothing the
 * panes actually exercise. When a pane needs real overlay behaviour —
 * a popover, a dialog — that is the point to bring the primitive in
 * rather than hand-rolling focus management.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "danger";
};

export function Button({ variant = "default", className, ...props }: ButtonProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium " +
    "transition-colors disabled:opacity-40 disabled:pointer-events-none " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500";
  const variants = {
    default: "bg-slate-700 text-slate-100 hover:bg-slate-600",
    ghost: "text-slate-300 hover:bg-slate-800 hover:text-slate-100",
    danger: "bg-rose-800 text-rose-50 hover:bg-rose-700",
  } as const;
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function Pane({
  title,
  right,
  children,
  className,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded border border-slate-800 bg-slate-900/60",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {title}
        </h2>
        {right}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** A hex word, in the width the machine uses. Tabular so columns of
 *  them line up rather than shimmering as values change. */
export function Hex({ value, bytes = 2 }: { value: number; bytes?: 1 | 2 }) {
  return (
    <span className="font-mono tabular-nums">
      ${value.toString(16).toUpperCase().padStart(bytes * 2, "0")}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-4 text-xs text-slate-500">{children}</p>;
}
