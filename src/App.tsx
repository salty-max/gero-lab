import { Cockpit } from "./components/cockpit.js";

export default function App() {
  return (
    <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)] bg-slate-950 text-slate-200">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-2">
        <h1 className="text-sm font-semibold tracking-tight">gero-lab</h1>
        <span className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
          browser playground
        </span>
      </header>
      <Cockpit />
    </div>
  );
}
