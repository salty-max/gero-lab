import { useEffect, useState } from 'react'
import { IconButton } from './ui/icon-button'
import { TvIcon } from 'lucide-react'

const STORAGE_KEY = 'gero:crt:v1'

export function CRTToggle() {
  const [on, setOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      return v === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (on) root.classList.add('crt')
    else root.classList.remove('crt')
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
    } catch {
      // ignore
    }
  }, [on])

  return (
    <IconButton
      variant="outline"
      aria-pressed={on}
      label={on ? 'Disable CRT effect' : 'Enable CRT effect'}
      icon={TvIcon}
      onClick={() => setOn((v) => !v)}
    />
  )
}
