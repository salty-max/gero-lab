import { Cockpit } from './components/cockpit'
import { Header } from './components/header'
import { VMProvider } from './contexts/vm-context'
import { ProgramProvider } from './contexts/program-context'
import { Toaster } from './components/ui/sonner'
import { Footer } from './components/footer'

function App() {
  return (
    <VMProvider>
      <ProgramProvider>
        <div className="h-screen grid grid-rows-[68px_auto_40px] gap-0">
          <Header />
          <Cockpit />
          <Footer />
        </div>
      </ProgramProvider>
      <Toaster />
    </VMProvider>
  )
}

export default App
