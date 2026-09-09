/**
 * Sharing a program as a link (gero-lab.md §8).
 *
 * The link carries the source set and its entry point, compressed into
 * the fragment — no server, no stored state, and nothing of the
 * sender's session. A program too large for a URL is refused with the
 * download it should use instead, rather than handed over truncated.
 *
 * The link is always shown, and copying it is a convenience on top:
 * the clipboard needs a permission browsers routinely refuse, and a
 * link that was built and then thrown away because of that is a link
 * the user cannot share.
 */

import { useRef, useState } from "react";
import { Check, Download, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ShareTooLongError } from "@/share";
import { sharedFrom, shareUrlFor, type Buffer } from "@/state/workspace";

/** How long the copied confirmation stays up. Long enough to read,
 *  short enough not to look like state. */
const CONFIRMATION_MS = 2000;

type Status =
  | { kind: "idle" }
  | { kind: "ready"; url: string; copied: boolean }
  | { kind: "too-long"; message: string }
  | { kind: "failed"; message: string };

export function ShareButton({ buffer }: { buffer: Buffer }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const field = useRef<HTMLInputElement>(null);

  const share = async () => {
    let url: string;
    try {
      url = await shareUrlFor(buffer);
    } catch (err: unknown) {
      setStatus(
        err instanceof ShareTooLongError
          ? { kind: "too-long", message: err.message }
          : { kind: "failed", message: err instanceof Error ? err.message : String(err) },
      );
      return;
    }

    // The link exists either way; the clipboard is the part that may
    // not be available.
    const copied = await navigator.clipboard.writeText(url).then(
      () => true,
      () => false,
    );
    setStatus({ kind: "ready", url, copied });
    requestAnimationFrame(() => field.current?.select());
    if (copied) {
      setTimeout(() => {
        setStatus((prev) => (prev.kind === "ready" ? { ...prev, copied: false } : prev));
      }, CONFIRMATION_MS);
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(sharedFrom(buffer), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${buffer.entry}.gerolab.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: "idle" });
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button size="sm" variant="ghost" onClick={() => void share()}>
        {status.kind === "ready" && status.copied ? <Check /> : <Link2 />}
        {status.kind === "ready" && status.copied ? "Copied" : "Share"}
      </Button>

      {status.kind === "ready" && (
        <Input
          ref={field}
          readOnly
          value={status.url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-6 w-56 font-mono text-[11px]"
          aria-label="shareable link"
        />
      )}

      {(status.kind === "too-long" || status.kind === "failed") && (
        <span
          className={cn(
            "text-[11px]",
            status.kind === "too-long" ? "text-warning" : "text-destructive",
          )}
        >
          {status.message}
        </span>
      )}

      {status.kind === "too-long" && (
        <Button size="xs" variant="outline" onClick={download}>
          <Download />
          Download
        </Button>
      )}
    </div>
  );
}
