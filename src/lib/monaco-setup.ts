import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import type * as monacoEditor from 'monaco-editor' // for Environment type

// Don't fight Monaco's own declaration; use its type.
declare global {
  interface Window {
    MonacoEnvironment?: monacoEditor.Environment
  }
  interface WorkerGlobalScope {
    MonacoEnvironment?: monacoEditor.Environment
  }
}

export function installMonacoWorkers(): void {
  const env: monacoEditor.Environment = {
    getWorker(): Worker {
      return new EditorWorker()
    },
  }

  // Assign in a way that works for both window and worker contexts
  type Host = { MonacoEnvironment?: monacoEditor.Environment }
  ;(globalThis as unknown as Host).MonacoEnvironment = env
}
