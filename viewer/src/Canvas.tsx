import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, MarkerType, Panel,
  useNodesState, useReactFlow, useOnViewportChange, useUpdateNodeInternals, useNodesInitialized,
  type Node, type NodeMouseHandler,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, Footprints, Maximize, Moon, Search, Sun, X } from 'lucide-react'
import type { CodeGraph, EdgeKind } from './types'
import { layoutGraph, type Direction } from './lib/layout'
import { ViewContext, type ViewState } from './lib/context'
import { EDGE_META, KIND_META, groupColor, resolveColor, type ThemeName } from './lib/theme'
import { CodeNodeView, DIAMETER, LABEL_BOX, type CodeFlowNode } from './nodes/CodeNodeView'
import { NodeCard } from './components/NodeCard'
import { GroupNodeView, type GroupFlowNode } from './nodes/GroupNodeView'
import { FlowEdgeView, type FlowEdge } from './edges/FlowEdgeView'
import { Inspector } from './components/Inspector'

const nodeTypes = { code: CodeNodeView, cluster: GroupNodeView }
const edgeTypes = { flow: FlowEdgeView }
type AnyNode = CodeFlowNode | GroupFlowNode

const INSPECTOR_W = 560

interface Props {
  graph: CodeGraph
  graphIds: string[]
  graphId: string
  onGraphChange: (id: string) => void
  initialNode?: string
  initialFlow?: string
  onNodeChange: (id: string | null) => void
  theme: ThemeName
  onToggleTheme: () => void
}

export function Canvas({ graph, graphIds, graphId, onGraphChange, initialNode, initialFlow, onNodeChange, theme, onToggleTheme }: Props) {
  const rf = useReactFlow<AnyNode, FlowEdge>()
  const updateInternals = useUpdateNodeInternals()
  const wrapRef = useRef<HTMLDivElement>(null)

  const [direction, setDirection] = useState<Direction>('RIGHT')
  const [laidOut, setLaidOut] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(initialNode ?? null)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [hiddenKinds, setHiddenKinds] = useState<Set<EdgeKind>>(new Set())
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [hover, setHover] = useState<string | null>(() => new URLSearchParams(location.hash.slice(1)).get('peek'))
  const hoverTimer = useRef<number | undefined>(undefined)
  // a #peek=<id> card stays put through the initial fit until the user moves the mouse
  const peekPinned = useRef(hover !== null)
  useEffect(() => {
    const unpin = () => { peekPinned.current = false }
    window.addEventListener('pointermove', unpin, { once: true })
    return () => window.removeEventListener('pointermove', unpin)
  }, [])
  // open after a short dwell; close after a grace period so the pointer can travel into the card
  const openHover = (id: string) => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHover(id), 220) }
  const keepHover = () => window.clearTimeout(hoverTimer.current)
  const closeHover = (delay = 260) => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHover(null), delay) }

  const groupColors = useMemo(() => {
    const m = new Map<string, string>()
    ;(graph.groups ?? []).forEach((g, i) => m.set(g.id, g.color ?? groupColor(i)))
    return m
  }, [graph])

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])

  // ---- nodes: circles have fixed sizes, so lay out straight away ----
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>(
    graph.nodes.map((n): CodeFlowNode => ({ id: n.id, type: 'code', position: { x: 0, y: 0 }, data: { node: n, order: 0 } })),
  )

  const runLayout = useCallback(async (dir: Direction) => {
    // ELK gets the circle + room for its label; React Flow gets the bare circle.
    const box = LABEL_BOX[dir]
    const sizes = new Map<string, { width: number; height: number }>()
    const offset = new Map<string, { x: number; y: number }>()
    for (const n of graph.nodes) {
      const d = DIAMETER[n.importance ?? 2]
      if (dir === 'RIGHT') {
        const w = Math.max(box.w, d)
        sizes.set(n.id, { width: w, height: d + box.h })
        offset.set(n.id, { x: (w - d) / 2, y: 0 })
      } else {
        const h = Math.max(box.h, d)
        sizes.set(n.id, { width: d + box.w, height: h })
        offset.set(n.id, { x: 0, y: (h - d) / 2 })
      }
    }
    const res = await layoutGraph(graph, sizes, dir)
    const ranked = [...res.nodes.entries()].sort((a, b) => (dir === 'RIGHT' ? a[1].x - b[1].x || a[1].y - b[1].y : a[1].y - b[1].y || a[1].x - b[1].x))
    const order = new Map(ranked.map(([id], i) => [id, i]))
    const groupNodes: GroupFlowNode[] = (graph.groups ?? [])
      .filter((g) => res.groups.has(g.id))
      .map((g) => {
        const r = res.groups.get(g.id)!
        return {
          id: `group:${g.id}`, type: 'cluster', position: { x: r.x, y: r.y },
          width: r.width, height: r.height, style: { width: r.width, height: r.height },
          zIndex: -10 + r.depth, selectable: false, draggable: false, focusable: false,
          data: { label: g.label, description: g.description, color: groupColors.get(g.id)!, depth: r.depth },
        }
      })
    setNodes((prev) => [
      ...groupNodes,
      ...prev.filter((n): n is CodeFlowNode => n.type === 'code').map((n) => {
        const p = res.nodes.get(n.id)
        const o = offset.get(n.id)!
        return { ...n, position: p ? { x: p.x + o.x, y: p.y + o.y } : n.position, data: { ...n.data, order: order.get(n.id) ?? 0 } }
      }),
    ])
    requestAnimationFrame(() => {
      updateInternals(graph.nodes.map((n) => n.id))
      setLaidOut(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, groupColors])

  const didLayout = useRef(false)
  useEffect(() => {
    if (didLayout.current) return
    didLayout.current = true
    void runLayout(direction)
  }, [direction, runLayout])

  const changeDirection = (d: Direction) => {
    setDirection(d)
    void runLayout(d)
  }

  // ---- zoom -> CSS variable (drives all level-of-detail fading without re-rendering) ----
  const setZoomVar = useCallback((z: number) => wrapRef.current?.style.setProperty('--z', z.toFixed(3)), [])
  useOnViewportChange({ onStart: () => { if (!peekPinned.current) setHover(null) }, onChange: (vp) => setZoomVar(vp.zoom) })
  useEffect(() => { if (laidOut) setZoomVar(rf.getZoom()) }, [laidOut, rf, setZoomVar])

  // ---- focus helpers ----
  const focusNode = useCallback((id: string, duration = 600, zoom?: number) => {
    const n = rf.getNode(id)
    if (!n || n.type !== 'code') return
    const d = DIAMETER[n.data.node.importance ?? 2]
    const z = zoom ?? Math.max(rf.getZoom(), 0.9)
    // offset for the inspector panel on the right
    rf.setCenter(n.position.x + d / 2 + INSPECTOR_W / 2 / z, n.position.y + d / 2 + 30 / z, { zoom: z, duration })
  }, [rf])

  const select = useCallback((id: string | null, focus = false) => {
    setSelectedId(id)
    onNodeChange(id)
    if (id && focus) focusNode(id)
  }, [focusNode, onNodeChange])

  // initial viewport, once laid-out positions are committed
  const didInitialView = useRef(false)
  // fitView ignores unmeasured nodes, so wait until React Flow reports every node (groups included) measured
  const initialized = useNodesInitialized()
  useEffect(() => {
    if (!laidOut || !initialized || didInitialView.current) return
    const all = rf.getNodes()
    if (!all.some((n) => n.type === 'cluster') && graph.groups?.length) return
    if (!all.every((n) => n.measured?.width)) return
    didInitialView.current = true
    if (initialFlow && graph.flows?.some((f) => f.id === initialFlow)) setFlowId(initialFlow)
    else if (initialNode && byId.has(initialNode)) focusNode(initialNode, 0)
    else void rf.fitView({ padding: 0.1, duration: 0 })
  }, [laidOut, initialized, nodes, initialNode, initialFlow, byId, graph, focusNode, rf])

  // ---- tour ----
  const flow = graph.flows?.find((f) => f.id === flowId) ?? null
  const tourSteps = useMemo(() => {
    const m = new Map<string, number[]>()
    flow?.steps.forEach((s, i) => m.set(s.node, [...(m.get(s.node) ?? []), i + 1]))
    return m
  }, [flow])
  const tourCurrent = flow?.steps[stepIdx]?.node ?? null

  const startFlow = (id: string) => { setFlowId(id); setStepIdx(0) }
  useEffect(() => {
    if (!flow || !laidOut) return
    const id = flow.steps[stepIdx]?.node
    if (id) { setSelectedId(id); onNodeChange(id); focusNode(id, 700, 1) }
  }, [flow, stepIdx, laidOut, focusNode, onNodeChange])

  // ---- highlight set ----
  const focusSet = useMemo(() => {
    if (flow) return new Set(flow.steps.map((s) => s.node))
    if (!selectedId) return null
    const s = new Set([selectedId])
    for (const e of graph.edges) {
      if (e.source === selectedId) s.add(e.target)
      if (e.target === selectedId) s.add(e.source)
    }
    return s
  }, [flow, selectedId, graph])

  const displayNodes = useMemo(() => nodes.map((n) => {
    if (n.type !== 'code') return n
    const dim = focusSet ? !focusSet.has(n.id) : false
    const cls = dim ? 'is-dim' : ''
    const sel = n.id === selectedId
    return n.className === cls && n.selected === sel ? n : { ...n, className: cls, selected: sel }
  }), [nodes, focusSet, selectedId])

  const edges = useMemo((): FlowEdge[] => {
    const tourPairs = new Set<string>()
    if (flow) for (let i = 0; i < flow.steps.length - 1; i++) {
      tourPairs.add(`${flow.steps[i].node}>${flow.steps[i + 1].node}`)
      tourPairs.add(`${flow.steps[i + 1].node}>${flow.steps[i].node}`)
    }
    return graph.edges.map((e, i) => {
      const kind = e.kind ?? 'calls'
      const active = flow ? tourPairs.has(`${e.source}>${e.target}`) : selectedId ? e.source === selectedId || e.target === selectedId : false
      const dim = (flow || selectedId) ? !active : false
      return {
        id: e.id ?? `e${i}`, source: e.source, target: e.target, type: 'flow',
        hidden: hiddenKinds.has(kind),
        zIndex: active ? 5 : 0,
        markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_META[kind]?.color ?? '#888', width: 14, height: 14, markerUnits: 'userSpaceOnUse' },
        data: { edge: e, active, dim },
      }
    })
  }, [graph, hiddenKinds, flow, selectedId])

  // ---- interaction ----
  const onNodeClick: NodeMouseHandler<AnyNode> = (_, n) => { if (n.type === 'code') { setHover(null); select(n.id) } }
  const onNodeMouseEnter: NodeMouseHandler<AnyNode> = (_, n) => {
    if (n.type !== 'code') return
    openHover(n.id)
  }
  const onNodeMouseLeave: NodeMouseHandler<AnyNode> = () => closeHover()
  const onNodeDoubleClick: NodeMouseHandler<AnyNode> = (_, n) => {
    if (n.type === 'cluster') {
      const gid = n.id.slice('group:'.length)
      rf.fitView({ nodes: graph.nodes.filter((x) => x.group === gid).map((x) => ({ id: x.id })), padding: 0.15, duration: 600 })
    } else focusNode(n.id, 600, 1.15)
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const typing = (ev.target as HTMLElement)?.tagName === 'INPUT'
      if (ev.key === 'Escape') { if (typing) (ev.target as HTMLElement).blur(); else if (flow) setFlowId(null); else select(null) }
      if (typing) return
      if (ev.key === '/') { ev.preventDefault(); searchRef.current?.focus() }
      if (flow && ev.key === 'ArrowRight') setStepIdx((i) => Math.min(i + 1, flow.steps.length - 1))
      if (flow && ev.key === 'ArrowLeft') setStepIdx((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flow, select])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return graph.nodes.filter((n) => [n.label, n.id, n.file, n.summary].some((s) => s?.toLowerCase().includes(q))).slice(0, 8)
  }, [query, graph])

  const view: ViewState = { graph, direction, tourSteps, tourCurrent, groupColors }
  const selected = selectedId ? byId.get(selectedId) : undefined
  const usedKinds = [...new Set(graph.edges.map((e) => e.kind ?? 'calls'))]

  return (
    <ViewContext.Provider value={view}>
      <div ref={wrapRef} className={`cf-canvas ${laidOut ? 'is-ready' : 'is-measuring'} ${selected ? 'has-inspector' : ''}`}>
        <ReactFlow<AnyNode, FlowEdge>
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onPaneClick={() => { if (!flow) select(null) }}
          minZoom={0.04}
          maxZoom={2.5}
          nodesConnectable={false}
          elementsSelectable
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background key={theme} variant={BackgroundVariant.Lines} gap={28} lineWidth={0.6} color={resolveColor('var(--grid)')} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable zoomable position="bottom-right"
            nodeColor={(n) => n.type === 'cluster' ? 'transparent' : resolveColor(KIND_META[(n as CodeFlowNode).data.node.kind]?.color ?? '#888')}
            nodeStrokeColor={(n) => n.type === 'cluster' ? resolveColor((n as GroupFlowNode).data.color) : 'transparent'}
            maskColor="rgba(244,239,228,0.75)"
            style={{ right: selected ? INSPECTOR_W : 0 }}
          />

          <Panel position="top-left" className="cf-toolbar">
            <div className="cf-brand">
              <span className="cf-brand-dot" />
              <div>
                <strong>{graph.meta.title}</strong>
                {graph.meta.description && <small>{graph.meta.description}</small>}
              </div>
            </div>
            {graphIds.length > 1 && (
              <select className="cf-select" value={graphId} onChange={(e) => onGraphChange(e.target.value)}>
                {graphIds.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <div className="cf-search">
              <Search size={14} />
              <input
                ref={searchRef} value={query} placeholder="Search nodes  /"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { select(results[0].id, true); setQuery('') } }}
              />
              {results.length > 0 && (
                <ul className="cf-results">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => { select(r.id, true); setQuery('') }}>
                        <span className="cf-dot" style={{ background: KIND_META[r.kind]?.color }} />
                        <span>{r.label}</span>
                        <small>{r.file}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="cf-seg">
              <button className={direction === 'RIGHT' ? 'on' : ''} onClick={() => changeDirection('RIGHT')} title="Left → right"><ArrowRight size={14} /></button>
              <button className={direction === 'DOWN' ? 'on' : ''} onClick={() => changeDirection('DOWN')} title="Top → bottom"><ArrowDown size={14} /></button>
            </div>
            <button className="cf-icon-btn" title="Fit view" onClick={() => rf.fitView({ padding: 0.08, duration: 500 })}><Maximize size={14} /></button>
            <button className="cf-icon-btn" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
          </Panel>

          {graph.flows?.length ? (
            <Panel position="top-left" className="cf-flows">
              <div className="cf-sec"><Footprints size={12} /> flows</div>
              {graph.flows.map((f) => (
                <button key={f.id} className={f.id === flowId ? 'on' : ''} onClick={() => (f.id === flowId ? setFlowId(null) : startFlow(f.id))} title={f.description}>
                  <span>{f.title}</span>
                  <small>{f.steps.length} steps</small>
                </button>
              ))}
            </Panel>
          ) : null}

          <Panel position="bottom-left" className="cf-legend">
            {usedKinds.map((k) => {
              const m = EDGE_META[k]
              const off = hiddenKinds.has(k)
              return (
                <button key={k} className={off ? 'off' : ''} onClick={() => setHiddenKinds((s) => { const n = new Set(s); if (off) n.delete(k); else n.add(k); return n })}>
                  <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" stroke={m.color} strokeWidth="2" strokeDasharray={m.dash} /></svg>
                  {m.label}
                </button>
              )
            })}
          </Panel>

          {flow && (
            <Panel position="bottom-center" className="cf-tour" style={selected ? { left: `calc(50% - ${INSPECTOR_W / 2}px)` } : undefined}>
              <div className="cf-tour-head">
                <span className="cf-tour-title">{flow.title}</span>
                <span className="cf-tour-count">{stepIdx + 1} / {flow.steps.length}</span>
                <button className="cf-icon-btn" onClick={() => setFlowId(null)} title="End tour (Esc)"><X size={14} /></button>
              </div>
              <div className="cf-tour-body">
                <strong>{byId.get(flow.steps[stepIdx].node)?.label}</strong>
                {flow.steps[stepIdx].note && <p>{flow.steps[stepIdx].note}</p>}
              </div>
              <div className="cf-tour-nav">
                <button disabled={stepIdx === 0} onClick={() => setStepIdx(stepIdx - 1)}><ChevronLeft size={14} /> prev</button>
                <div className="cf-tour-dots">
                  {flow.steps.map((_, i) => <button key={i} className={i === stepIdx ? 'on' : i < stepIdx ? 'done' : ''} onClick={() => setStepIdx(i)} />)}
                </div>
                <button disabled={stepIdx === flow.steps.length - 1} onClick={() => setStepIdx(stepIdx + 1)}>next <ChevronRight size={14} /></button>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {selected && <Inspector graph={graph} node={selected} onClose={() => select(null)} onNavigate={(id) => select(id, true)} />}
        {hover && hover !== selectedId && <HoverCard id={hover} graph={graph} onEnter={keepHover} onLeave={() => closeHover(120)} onOpen={(id) => { setHover(null); select(id) }} />}
        {!laidOut && <div className="cf-loading">laying out graph…</div>}
      </div>
    </ViewContext.Provider>
  )
}

/** Rectangular explain-card, placed beside the hovered circle in screen space (constant size at any zoom). */
function HoverCard({ id, graph, onEnter, onLeave, onOpen }: { id: string; graph: CodeGraph; onEnter: () => void; onLeave: () => void; onOpen: (id: string) => void }) {
  const rf = useReactFlow<AnyNode, FlowEdge>()
  const n = rf.getNode(id)
  if (!n || n.type !== 'code') return null
  const node = n.data.node
  const d = DIAMETER[node.importance ?? 2]
  const right = rf.flowToScreenPosition({ x: n.position.x + d, y: n.position.y + d / 2 })
  const left = rf.flowToScreenPosition({ x: n.position.x, y: n.position.y + d / 2 })
  const W = 400
  const gap = 18
  const flip = right.x + gap + W > window.innerWidth - 12
  const x = flip ? left.x - gap - W : right.x + gap
  const top = Math.max(12, Math.min(right.y - 70, window.innerHeight - 560))
  return (
    <div
      className={`cf-hover nowheel ${flip ? 'from-right' : 'from-left'}`}
      style={{ left: Math.max(12, x), top, width: W, maxHeight: window.innerHeight - top - 12 }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => onOpen(id)}
      onWheel={(e) => e.stopPropagation()}
    >
      <NodeCard node={node} groupLabel={graph.groups?.find((g) => g.id === node.group)?.label} />
    </div>
  )
}

export type { Node }
