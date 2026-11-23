import type { EdgeKind, NodeKind } from '../types'
import {
  Play, FunctionSquare, Box, Boxes, ListTree, Shapes, Puzzle, Type, Package,
  Route, Settings2, Database, Globe, Radio, Braces, type LucideIcon,
} from 'lucide-react'

// Colors are CSS variables so light/dark themes (styles.css) can swap the pastel set.
// Palette: --c-coral --c-peri --c-mint --c-lav --c-peach --c-sky --c-butter --c-rose --c-sage --c-stone
const c = (name: string) => `var(--c-${name})`

export const KIND_META: Record<NodeKind, { color: string; icon: LucideIcon; label: string }> = {
  entry:     { color: c('coral'),  icon: Play,           label: 'entry' },
  function:  { color: c('peri'),   icon: FunctionSquare, label: 'fn' },
  method:    { color: c('peri'),   icon: Braces,         label: 'method' },
  struct:    { color: c('mint'),   icon: Box,            label: 'struct' },
  class:     { color: c('mint'),   icon: Boxes,          label: 'class' },
  enum:      { color: c('butter'), icon: ListTree,       label: 'enum' },
  trait:     { color: c('lav'),    icon: Puzzle,         label: 'trait' },
  interface: { color: c('lav'),    icon: Shapes,         label: 'interface' },
  type:      { color: c('sky'),    icon: Type,           label: 'type' },
  module:    { color: c('stone'),  icon: Package,        label: 'module' },
  handler:   { color: c('peach'),  icon: Route,          label: 'handler' },
  config:    { color: c('sage'),   icon: Settings2,      label: 'config' },
  store:     { color: c('rose'),   icon: Database,       label: 'store' },
  external:  { color: c('stone'),  icon: Globe,          label: 'external' },
  event:     { color: c('sky'),    icon: Radio,          label: 'event' },
}

export const EDGE_META: Record<EdgeKind, { color: string; dash?: string; animated?: boolean; label: string }> = {
  calls:   { color: c('peri'),  label: 'calls' },
  data:    { color: c('mint'),  animated: true, label: 'data' },
  returns: { color: c('sky'),   dash: '2 5', label: 'returns' },
  impl:    { color: c('lav'),   dash: '7 5', label: 'implements' },
  owns:    { color: c('stone'), dash: '1 4', label: 'owns' },
  uses:    { color: c('stone'), label: 'uses' },
  reads:   { color: c('rose'),  label: 'reads' },
  writes:  { color: c('coral'), animated: true, label: 'writes' },
  emits:   { color: c('sky'),   animated: true, dash: '6 4', label: 'emits' },
}

const GROUP_PALETTE = ['peri', 'mint', 'lav', 'peach', 'rose', 'sky', 'butter', 'sage'].map(c)
export const groupColor = (i: number) => GROUP_PALETTE[i % GROUP_PALETTE.length]

/** Resolve `var(--x)` to its current computed value (for SVG attributes that can't take var()). */
export function resolveColor(color: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(color)
  if (!m || typeof document === 'undefined') return color
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || color
}

export type ThemeName = 'light' | 'dark'

export function langFromPath(p?: string): string | undefined {
  const ext = p?.split('.').pop()?.toLowerCase()
  if (!ext) return
  const map: Record<string, string> = {
    rs: 'rust', go: 'go', py: 'python', ts: 'tsx', tsx: 'tsx', js: 'jsx', jsx: 'jsx', mjs: 'jsx',
    c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', swift: 'swift', kt: 'kotlin',
    json: 'json', yaml: 'yaml', yml: 'yaml', graphql: 'graphql', md: 'markdown', m: 'objectivec',
  }
  return map[ext] ?? ext
}
