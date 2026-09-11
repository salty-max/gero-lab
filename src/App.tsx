import { toast } from "sonner";

import { BookView } from "./components/book-view";
import { Cockpit } from "./components/cockpit";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { Toaster } from "./components/ui/sonner";
import { ProgramProvider, useProgram } from "./contexts/program-context";
import { VMProvider } from "./contexts/vm-context";
import { useRoute } from "./hooks/use-route";

function App() {
  return (
    <VMProvider>
      <ProgramProvider>
        <AppShell />
        <Toaster />
      </ProgramProvider>
    </VMProvider>
  );
}

function AppShell() {
  const route = useRoute();
  const program = useProgram();

  const openSnippet = async (code: string, lang: "gero" | "asm") => {
    const text = code.endsWith("\n") ? code : `${code}\n`;
    const entry = lang === "gero" ? "main.gr" : "main.gas";
    const files = [{ name: entry, text }];
    const out = await program.loadProgram(files, entry, lang === "gero" ? "gr" : "gas");
    globalThis.location.hash = "/";
    if (out.image.length > 0) {
      toast.message("Opened in the lab — Run from the toolbar.");
    }
  };

  return (
    <div className="grid h-screen grid-rows-[68px_minmax(0,1fr)_40px] gap-0">
      <Header route={route} />
      {route.view === "book" ? (
        <BookView slug={route.slug} onOpenSnippet={(code, lang) => void openSnippet(code, lang)} />
      ) : (
        <Cockpit />
      )}
      <Footer />
    </div>
  );
}

export default App;
