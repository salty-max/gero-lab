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

  const openGero = (code: string) => {
    const text = code.endsWith("\n") ? code : `${code}\n`;
    program.setProgram([{ name: "main.gr", text }], "main.gr", "gr");
    globalThis.location.hash = "/";
    toast.message("Opened in the lab — Run from the toolbar.");
  };

  return (
    <div className="grid h-screen grid-rows-[68px_auto_40px] gap-0">
      <Header route={route} />
      {route.view === "book" ? <BookView slug={route.slug} onOpenGero={openGero} /> : <Cockpit />}
      <Footer />
    </div>
  );
}

export default App;
