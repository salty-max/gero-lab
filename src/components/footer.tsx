import { HeartIcon } from 'lucide-react'

import { useVM } from '@/contexts/vm-context'

export function Footer() {
  const { vmVersion } = useVM()
  return (
    <footer className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground bg-background sm:px-6">
      <span>
        VM: <span className="text-gero">Gero</span>{' '}
        {/* The module reports it on connect. Writing a number here
            instead is how the footer came to claim v0.1 while the
            toolchain underneath had moved twice. */}
        {vmVersion ? `v${vmVersion}` : '…'}
      </span>
      <span className="flex items-center gap-1.5">
        Made with
        <HeartIcon className="h-4 w-4 animate-pulse inline-block text-gero" />
        by Jellycat Studios
      </span>
    </footer>
  )
}
