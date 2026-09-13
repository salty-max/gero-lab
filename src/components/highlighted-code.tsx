import { useEffect, useState } from "react";

import { highlight, paintLine, tokenClass, type LineToken } from "@/lib/highlight";
import type { Lang } from "@/worker/protocol";

/** Colour a buffer with the published grammar, the same way the editor
 *  does. A grammar that will not load leaves the text uncoloured. */
export function HighlightedCode({ code, lang }: { code: string; lang: Lang }) {
  const [tokens, setTokens] = useState<Map<number, LineToken[]>>(new Map());

  useEffect(() => {
    let live = true;
    void highlight(code, lang).then((next) => {
      if (live) setTokens(next);
    });
    return () => {
      live = false;
    };
  }, [code, lang]);

  const sourceLines = code.split("\n");
  return (
    <pre className="overflow-x-auto p-3 text-sm leading-6">
      <code>
        {sourceLines.map((line, row) => (
          <span key={`${String(row)}:${line}`} className="block min-h-[1.5em]">
            {paintLine(line, tokens.get(row) ?? []).map((span, i) => (
              <span key={`${span.token}:${span.text}:${String(i)}`} className={tokenClass(span.token)}>
                {span.text}
              </span>
            ))}
          </span>
        ))}
      </code>
    </pre>
  );
}
