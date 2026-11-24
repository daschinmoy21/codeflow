import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/style.css'
import './styles.css'
import type { CodeGraph } from './types'
import { Canvas } from './Canvas'
import { ThemeContext } from './lib/context'
import type { ThemeName } from './lib/theme'

// Every *.json in CODEFLOW_GRAPHS (default ./graphs) becomes a selectable graph.
const modules = import.meta.glob<CodeGraph>('@graphs/*.json', { eager: true, import: 'default' })
const graphs = new Map(
  Object.entries(modules).map(([p, g]) => [p.split('/').pop()!.replace(/\.json$/, ''), g]),
)
const ids = [...graphs.keys()].sort()

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1))
  return { g: h.get('g'), n: h.get('n'), flow: h.get('flow') }
}

function initialTheme(): ThemeName {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('theme')
  if (fromHash === 'light' || fromHash === 'dark') return fromHash
  try {
    const saved = localStorage.getItem('codeflow-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage unavailable */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const t = initialTheme()
    document.documentElement.dataset.theme = t
    return t
  })
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = t
    try { localStorage.setItem('codeflow-theme', t) } catch { /* ignore */ }
    setTheme(t)
  }
  const [graphId, setGraphId] = useState(() => {
    const g = readHash().g
    return g && graphs.has(g) ? g : ids[0]
  })
  const writeHash = (g: string, n: string | null) => {
    const p = new URLSearchParams({ g })
    if (n) p.set('n', n)
    // view preferences survive node/graph changes
    const cur = new URLSearchParams(location.hash.slice(1))
    for (const k of ['dir', 'theme']) { const v = cur.get(k); if (v) p.set(k, v) }
    history.replaceState(null, '', `#${p}`)
  }
  useEffect(() => { document.title = `${graphs.get(graphId)?.meta.title ?? 'Codeflow'} · codeflow` }, [graphId])

  if (!graphId) {
    return <div className="cf-empty">No graphs found. Put <code>*.json</code> files in the graphs directory (CODEFLOW_GRAPHS).</div>
  }
  return (
    <ThemeContext.Provider value={theme}>
    <ReactFlowProvider key={graphId}>
      <Canvas
        theme={theme}
        onToggleTheme={toggleTheme}
        graph={graphs.get(graphId)!}
        graphIds={ids}
        graphId={graphId}
        initialNode={readHash().n ?? undefined}
        initialFlow={readHash().flow ?? undefined}
        onGraphChange={(g) => { setGraphId(g); writeHash(g, null) }}
        onNodeChange={(n) => writeHash(graphId, n)}
      />
    </ReactFlowProvider>
    </ThemeContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
