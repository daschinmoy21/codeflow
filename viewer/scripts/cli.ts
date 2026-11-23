#!/usr/bin/env bun
/**
 * codeflow CLI
 *
 *   bun scripts/cli.ts hydrate <graph.json> [--root <repo>]
 *       Fill `snippet.code` / `code.code` from disk using start/end line ranges,
 *       so code shown in the viewer is always real. Writes the file in place.
 *
 *   bun scripts/cli.ts check <graph.json | dir> [--root <repo>]
 *       Validate schema + references, and (with a root) that files/lines exist
 *       and snippets still match the source. Exit code 1 on errors.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { CodeGraph, Snippet, CodeNode } from '../src/types'

const NODE_KINDS = ['entry', 'function', 'method', 'struct', 'class', 'enum', 'trait', 'interface', 'type', 'module', 'handler', 'config', 'store', 'external', 'event']
const EDGE_KINDS = ['calls', 'data', 'returns', 'impl', 'owns', 'uses', 'reads', 'writes', 'emits']
const DEFAULT_SNIPPET_LINES = 12
const DEFAULT_CODE_LINES = 60

const [cmd, target, ...rest] = process.argv.slice(2)
const rootFlag = rest.indexOf('--root') >= 0 ? rest[rest.indexOf('--root') + 1] : undefined

if (!cmd || !target || !['hydrate', 'check'].includes(cmd)) {
  console.error('usage: cli.ts <hydrate|check> <graph.json|dir> [--root <repo>]')
  process.exit(2)
}

const fileCache = new Map<string, string[] | null>()
function readLines(abs: string): string[] | null {
  if (!fileCache.has(abs)) fileCache.set(abs, existsSync(abs) ? readFileSync(abs, 'utf8').split('\n') : null)
  return fileCache.get(abs)!
}

function resolveRoot(g: CodeGraph, graphFile: string): string | undefined {
  const r = rootFlag ?? g.meta.root
  return r ? path.resolve(path.dirname(graphFile), r) : undefined
}

const files = statSync(target).isDirectory()
  ? readdirSync(target).filter((f) => f.endsWith('.json')).map((f) => path.join(target, f))
  : [target]

let failed = false
for (const f of files) {
  const g = JSON.parse(readFileSync(f, 'utf8')) as CodeGraph
  if (cmd === 'hydrate') hydrate(g, f)
  else if (!check(g, f)) failed = true
}
process.exit(failed ? 1 : 0)

// ───────────────────────────── hydrate ─────────────────────────────
function hydrate(g: CodeGraph, graphFile: string) {
  const root = resolveRoot(g, graphFile)
  if (!root) { console.error(`${graphFile}: no root (pass --root or set meta.root)`); process.exit(2) }
  let filled = 0, missing = 0
  const fill = (n: CodeNode, s: Snippet | undefined, defLines: number) => {
    if (!s || s.start == null) return
    const rel = s.file ?? n.file
    if (!rel) { console.warn(`  ! ${n.id}: snippet has start but no file`); missing++; return }
    const lines = readLines(path.resolve(root, rel))
    if (!lines) { console.warn(`  ! ${n.id}: file not found ${rel}`); missing++; return }
    const end = Math.min(s.end ?? s.start + defLines - 1, lines.length)
    s.end = end
    s.code = dedent(lines.slice(s.start - 1, end)).join('\n')
    filled++
  }
  for (const n of g.nodes) {
    fill(n, n.snippet, DEFAULT_SNIPPET_LINES)
    fill(n, n.code, DEFAULT_CODE_LINES)
    if (n.line == null && n.snippet?.start) n.line = n.snippet.start
  }
  g.meta.generatedAt ??= new Date().toISOString()
  writeFileSync(graphFile, JSON.stringify(g, null, 2) + '\n')
  console.log(`hydrated ${graphFile}: ${filled} snippets${missing ? `, ${missing} missing` : ''}`)
}

function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(min).replace(/\s+$/, ''))
}

// ───────────────────────────── check ─────────────────────────────
function check(g: CodeGraph, graphFile: string): boolean {
  const errors: string[] = []
  const warns: string[] = []
  const root = resolveRoot(g, graphFile)

  if (g.version !== 1) errors.push('version must be 1')
  if (!g.meta?.title) errors.push('meta.title is required')
  if (!Array.isArray(g.nodes) || !g.nodes.length) errors.push('nodes[] is empty')
  if (!Array.isArray(g.edges)) errors.push('edges[] missing')

  const ids = new Set<string>()
  const groups = new Map((g.groups ?? []).map((x) => [x.id, x]))
  for (const grp of g.groups ?? []) {
    if (grp.parent && !groups.has(grp.parent)) errors.push(`group ${grp.id}: unknown parent ${grp.parent}`)
    const seen = new Set<string>()
    for (let p: string | undefined = grp.id; p; p = groups.get(p)?.parent) {
      if (seen.has(p)) { errors.push(`group ${grp.id}: parent cycle`); break }
      seen.add(p)
    }
  }

  for (const n of g.nodes ?? []) {
    if (!n.id) { errors.push(`node without id: ${JSON.stringify(n).slice(0, 80)}`); continue }
    if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`)
    ids.add(n.id)
    if (!n.label) errors.push(`${n.id}: label required`)
    if (!NODE_KINDS.includes(n.kind)) errors.push(`${n.id}: unknown kind "${n.kind}" (use one of ${NODE_KINDS.join(', ')})`)
    if (n.group && !groups.has(n.group)) errors.push(`${n.id}: unknown group ${n.group}`)
    if (n.kind !== 'external' && !n.file) warns.push(`${n.id}: no file`)
    if (!n.summary) warns.push(`${n.id}: no summary`)

    for (const [which, s] of [['snippet', n.snippet], ['code', n.code]] as const) {
      if (!s) continue
      if (!s.code) { warns.push(`${n.id}.${which}: no code (run hydrate)`); continue }
      const len = s.code.split('\n').length
      if (which === 'snippet' && len > 18) warns.push(`${n.id}.snippet: ${len} lines; keep in-node snippets ≤ 14, put the rest in "code"`)
      if (root && s.start) {
        const rel = s.file ?? n.file
        const lines = rel ? readLines(path.resolve(root, rel)) : null
        if (!lines) errors.push(`${n.id}.${which}: file not found ${rel}`)
        else {
          const first = s.code.split('\n').find((l) => l.trim())?.trim()
          const window = lines.slice(Math.max(0, s.start - 3), s.start + 3).map((l) => l.trim())
          if (first && !window.includes(first)) warns.push(`${n.id}.${which}: code does not match ${rel}:${s.start} (stale? re-run hydrate)`)
        }
      }
    }
    if (root && n.file && !readLines(path.resolve(root, n.file))) errors.push(`${n.id}: file not found ${n.file}`)
    if (root && n.file && n.line) {
      const lines = readLines(path.resolve(root, n.file))
      if (lines && n.line > lines.length) errors.push(`${n.id}: line ${n.line} beyond end of ${n.file} (${lines.length} lines)`)
    }
  }

  const degree = new Map<string, number>()
  ;(g.edges ?? []).forEach((e, i) => {
    const tag = e.id ?? `edge[${i}] ${e.source}→${e.target}`
    if (!ids.has(e.source)) errors.push(`${tag}: unknown source ${e.source}`)
    if (!ids.has(e.target)) errors.push(`${tag}: unknown target ${e.target}`)
    if (e.kind && !EDGE_KINDS.includes(e.kind)) errors.push(`${tag}: unknown kind "${e.kind}" (use one of ${EDGE_KINDS.join(', ')})`)
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  })
  for (const id of ids) if (!degree.get(id)) warns.push(`${id}: not connected to anything`)

  for (const fl of g.flows ?? []) {
    if (!fl.steps?.length) errors.push(`flow ${fl.id}: no steps`)
    for (const s of fl.steps ?? []) if (!ids.has(s.node)) errors.push(`flow ${fl.id}: unknown node ${s.node}`)
  }

  const name = path.basename(graphFile)
  console.log(`${name}: ${ids.size} nodes, ${g.edges?.length ?? 0} edges, ${g.groups?.length ?? 0} groups, ${g.flows?.length ?? 0} flows${root ? '' : ' (no root: skipped source checks)'}`)
  for (const e of errors) console.log(`  ✗ ${e}`)
  for (const w of warns) console.log(`  ⚠ ${w}`)
  if (!errors.length) console.log(`  ✓ ok${warns.length ? ` (${warns.length} warnings)` : ''}`)
  return errors.length === 0
}
