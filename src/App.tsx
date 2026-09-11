import { BookView } from "./components/book-view";
import { Cockpit } from "./components/cockpit";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { Toaster } from "./components/ui/sonner";
import { ProgramProvider } from "./contexts/program-context";
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
  return (
    <div className="grid h-screen grid-rows-[68px_minmax(0,1fr)_40px] gap-0">
      <Header route={route} />
      {route.view === "book" ? <BookView slug={route.slug} /> : <Cockpit />}
      <Footer />
    </div>
  );
}

export default App;
