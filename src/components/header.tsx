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
    <header className="flex items-center justify-between gap-3 bg-background px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3 sm:gap-6">
        <a
          href={hrefFor({ view: "lab" })}
          className="flex items-center gap-2"
          aria-label="Gero Lab"
        >
          <span
            className="inline-block h-6 w-auto text-gero [&>svg]:h-full [&>svg]:w-auto"
            dangerouslySetInnerHTML={{ __html: GeroLogoRaw }}
          />
          <h1 className="hidden text-2xl sm:block">
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
            href={hrefFor({ view: "library" })}
            className={cn(
              "rounded-md px-2 py-1 hover:bg-accent",
              (route.view === "book" || route.view === "library") && "text-gero",
            )}
          >
            Books
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
            <span className="hidden sm:inline">Source Code</span>
          </Button>
        </a>
      </nav>
    </header>
  );
}
