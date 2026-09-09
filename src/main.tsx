import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { installMonacoWorkers } from './lib/monaco-setup'
import { ThemeProvider } from './components/theme-provider'

// Ensure Monaco workers are installed once before app mounts
installMonacoWorkers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  </StrictMode>
)
