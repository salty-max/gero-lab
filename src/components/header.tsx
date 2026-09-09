import { CodeXmlIcon } from 'lucide-react'
import { ModeToggle } from './mode-toggle'
import { CRTToggle } from './crt-toggle'
import { ShareButton } from './share-button'
import { Button } from './ui/button'

import GeroLogoRaw from '@/assets/gero-logo.svg?raw'

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-background">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-6 w-auto text-gero [&>svg]:h-full [&>svg]:w-auto"
          dangerouslySetInnerHTML={{ __html: GeroLogoRaw }}
        />
        <h1 className="text-2xl">
          <span className="text-gero font-bold">Gero</span>
          <span>Lab</span>
        </h1>
      </div>
      <nav className="flex gap-3">
        <div className="flex items-center gap-2">
          <ShareButton />
          <CRTToggle />
          <ModeToggle />
        </div>
        <a
          href="https://github.com/salty-max/gero_2.0/tree/main/apps/gero-lab"
          target="_blank"
        >
          <Button variant="outline">
            <CodeXmlIcon className="h-4 w-4" />
            Source Code
          </Button>
        </a>
      </nav>
    </header>
  )
}
