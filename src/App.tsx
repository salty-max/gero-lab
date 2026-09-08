import { Cockpit } from "@/components/cockpit";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground">
        <header className="flex items-center gap-3 border-b px-4 py-2">
          <h1 className="text-sm font-semibold tracking-tight">
            gero<span className="text-gero">-lab</span>
          </h1>
          <span className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            browser playground
          </span>
        </header>
        <Cockpit />
      </div>
    </TooltipProvider>
  );
}
