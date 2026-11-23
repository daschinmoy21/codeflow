import { createContext, useContext } from 'react'
import type { CodeGraph } from '../types'
import type { Direction } from './layout'

export interface ViewState {
  graph: CodeGraph
  direction: Direction
  /** nodeId -> 1-based step numbers in the active flow */
  tourSteps: Map<string, number[]>
  tourCurrent: string | null
  groupColors: Map<string, string>
}

export const ViewContext = createContext<ViewState | null>(null)

export const ThemeContext = createContext<'light' | 'dark'>('light')

export function useView(): ViewState {
  const v = useContext(ViewContext)
  if (!v) throw new Error('ViewContext missing')
  return v
}

export function editorLink(graph: CodeGraph, file?: string, line?: number): string | undefined {
  if (!file || !graph.meta.root) return
  const tpl = graph.meta.linkTemplate ?? 'vscode://file/{abs}:{line}'
  const abs = file.startsWith('/') ? file : `${graph.meta.root.replace(/\/$/, '')}/${file}`
  return tpl.replace('{abs}', abs).replace('{path}', file).replace('{line}', String(line ?? 1))
}
