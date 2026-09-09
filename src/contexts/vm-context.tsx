import { createContext, useContext, type PropsWithChildren } from 'react'
import { useVMService } from '@/hooks/use-vm'

export type VMApi = ReturnType<typeof useVMService>

const VMContext = createContext<VMApi | null>(null)

// The service takes no options: the memory map and the interrupt vector
// table are the ISA's, not the host's, and the module owns both.
export function VMProvider({ children }: PropsWithChildren) {
  const vm = useVMService()
  return <VMContext.Provider value={vm}>{children}</VMContext.Provider>
}

export function useVM(): VMApi {
  const ctx = useContext(VMContext)
  if (!ctx) throw new Error('useVM must be used within <VMProvider>')
  return ctx
}
