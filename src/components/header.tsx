import { CodeXmlIcon } from "lucide-react";

import GeroLogoRaw from "@/assets/gero-logo.svg?raw";
import { hrefFor, type Route } from "@/lib/route";
import { cn } from "@/lib/utils";

import { CRTToggle } from "./crt-toggle";
import { ModeToggle } from "./mode-toggle";
import { ShareButton } from "./share-button";
import { Button } from "./ui/button";

export function Header({ route }: { route: Route }) {
  return (
    <header className="flex items-center justify-between bg-background px-6 py-4">
      <div className="flex items-center gap-6">
        <a
          href={hrefFor({ view: "lab" })}
          className="flex items-center gap-2"
          aria-label="Gero Lab"
        >
          <span
            className="inline-block h-6 w-auto text-gero [&>svg]:h-full [&>svg]:w-auto"
            dangerouslySetInnerHTML={{ __html: GeroLogoRaw }}
          />
          <h1 className="text-2xl">
            <span className="font-bold text-gero">Gero</span>
            <span>Lab</span>
          </h1>
        </a>
        <nav className="flex items-center gap-1 text-sm">
          <a
            href={hrefFor({ view: "lab" })}
            className={cn(
              "rounded-md px-2 py-1 hover:bg-accent",
              route.view === "lab" && "text-gero",
            )}
          >
            Lab
          </a>
          <a
            href={hrefFor({ view: "book", slug: "" })}
            className={cn(
              "rounded-md px-2 py-1 hover:bg-accent",
              route.view === "book" && "text-gero",
            )}
          >
            Book
          </a>
        </nav>
      </div>
      <nav className="flex gap-3">
        <div className="flex items-center gap-2">
          {route.view === "lab" ? <ShareButton /> : null}
          <CRTToggle />
          <ModeToggle />
        </div>
        <a href="https://github.com/salty-max/gero-lab" target="_blank" rel="noreferrer">
          <Button variant="outline">
            <CodeXmlIcon className="h-4 w-4" />
            Source Code
          </Button>
        </a>
      </nav>
    </header>
  );
}
