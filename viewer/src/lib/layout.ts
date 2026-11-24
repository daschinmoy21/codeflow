import ELK, { type ElkNode, type ElkExtendedEdge, type ElkLabel } from 'elkjs/lib/elk.bundled.js'
import type { CodeEdge, CodeGraph } from '../types'
import { EDGE_META } from './theme'

const elk = new ELK()

export type Direction = 'RIGHT' | 'DOWN'

export interface Point { x: number; y: number }

export interface EdgeRoute {
  /** polyline in flow coordinates: start, bends…, end */
  points: Point[]
  /** centre of the edge label */
  label?: Point
  /** false when ELK skipped this label and we picked a spot ourselves (it may overlap) */
  labelPlaced: boolean
}

export interface LayoutResult {
  nodes: Map<string, Point>
  groups: Map<string, { x: number; y: number; width: number; height: number; depth: number }>
  /** keyed by the edge's React Flow id */
  edges: Map<string, EdgeRoute>
}

export interface NodeBox {
  /** the circle */
  d: number
  /** space the text label needs (below the circle for RIGHT, beside it for DOWN) */
  labelW: number
  labelH: number
}

const GROUP_PREFIX = '__group__'
const EDGE_PREFIX = '__edge__'

/** Stable id shared by the layout and the rendered edge. */
export const edgeId = (e: CodeEdge, i: number) => e.id ?? `e${i}`

/**
 * Rough size of an edge label as rendered by FlowEdgeView at full detail.
 * ELK reserves this space, so labels never sit on top of nodes or each other.
 */
export function edgeLabelSize(e: CodeEdge): { width: number; height: number } {
  const text = e.label ?? EDGE_META[e.kind ?? 'calls']?.label ?? ''
  const w1 = text.length * 6.2
  const w2 = e.payload ? e.payload.length * 6.1 : 0
  return { width: Math.ceil(Math.max(w1, w2) + 22), height: e.payload ? 34 : 20 }
}

/**
 * Hierarchical layered layout. Groups become ELK compound nodes so every
 * module's members stay inside one box. ELK also routes the edges
 * (orthogonal, each edge gets its own attachment point and its own lane),
 * and places every edge label as a real obstacle.
 */
export async function layoutGraph(
  graph: CodeGraph,
  boxes: Map<string, NodeBox>,
  direction: Direction,
): Promise<LayoutResult> {
  const horizontal = direction === 'RIGHT'
  const groupIds = new Set((graph.groups ?? []).map((g) => g.id))
  const elkGroups = new Map<string, ElkNode>()
  for (const g of graph.groups ?? []) {
    elkGroups.set(g.id, {
      id: GROUP_PREFIX + g.id,
      children: [],
      layoutOptions: { 'elk.padding': '[top=72,left=40,bottom=40,right=40]' },
    })
  }

  const root: ElkNode = {
    id: 'root',
    children: [],
    edges: [],
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.json.edgeCoords': 'ROOT',
      'elk.json.shapeCoords': 'ROOT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': horizontal ? '90' : '70',
      'elk.spacing.nodeNode': horizontal ? '56' : '48',
      'elk.layered.spacing.edgeNodeBetweenLayers': '28',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.spacing.edgeEdge': '14',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeLabel': '6',
      'elk.spacing.labelNode': '10',
      'elk.spacing.componentComponent': '120',
      'elk.edgeLabels.inline': 'false',
      'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.thoroughness': '30',
    },
  }

  for (const g of graph.groups ?? []) {
    const node = elkGroups.get(g.id)!
    const parent = g.parent && groupIds.has(g.parent) ? elkGroups.get(g.parent)! : root
    parent.children!.push(node)
  }

  for (const n of graph.nodes) {
    const b = boxes.get(n.id) ?? { d: 68, labelW: 190, labelH: 60 }
    const parent = n.group && groupIds.has(n.group) ? elkGroups.get(n.group)! : root
    // The ELK node is the circle itself, so edges attach to the circle and not to
    // the text. The text label is an outside node label that ELK keeps clear.
    const label: ElkLabel = { text: n.label, width: b.labelW, height: b.labelH }
    parent.children!.push({
      id: n.id,
      width: b.d,
      height: b.d,
      labels: [label],
      layoutOptions: {
        'elk.nodeLabels.placement': horizontal ? '[H_CENTER, V_BOTTOM, OUTSIDE]' : '[H_RIGHT, V_CENTER, OUTSIDE]',
        'elk.nodeSize.constraints': '',
        'elk.portConstraints': 'FREE',
      },
    })
  }

  // Each edge lives in the deepest group containing both ends (its lowest common
  // ancestor). ELK skips label placement for edges declared at the wrong level.
  const nodeGroup = new Map(graph.nodes.map((n) => [n.id, n.group && groupIds.has(n.group) ? n.group : undefined]))
  const groupParent = new Map((graph.groups ?? []).map((g) => [g.id, g.parent && groupIds.has(g.parent) ? g.parent : undefined]))
  const chain = (g: string | undefined) => {
    const out: (string | undefined)[] = []
    for (let cur = g, guard = 0; cur && guard < 64; cur = groupParent.get(cur), guard++) out.push(cur)
    return out
  }
  const lca = (a: string, b: string): ElkNode => {
    const ca = chain(nodeGroup.get(a))
    const cb = new Set(chain(nodeGroup.get(b)))
    const g = ca.find((x) => cb.has(x))
    return (g && elkGroups.get(g)) || root
  }
  for (const [e, i] of graph.edges.map((e, i) => [e, i] as const)) {
    if (e.source === e.target || !nodeGroup.has(e.source) || !nodeGroup.has(e.target)) continue
    const container = lca(e.source, e.target)
    ;(container.edges ??= []).push({
      // ELK ids share one namespace with nodes/groups; keep edges in their own
      id: EDGE_PREFIX + i,
      sources: [e.source],
      targets: [e.target],
      // same text the renderer shows (kind name when unlabelled); ELK skips empty labels
      labels: [{ text: e.label ?? EDGE_META[e.kind ?? 'calls']?.label ?? 'edge', ...edgeLabelSize(e), layoutOptions: { 'elk.edgeLabels.placement': 'CENTER' } }],
    })
  }

  // ELK fails on empty compound nodes — drop them
  const prune = (n: ElkNode): boolean => {
    if (!n.id.startsWith(GROUP_PREFIX)) return true
    n.children = (n.children ?? []).filter(prune)
    return n.children.length > 0
  }
  root.children = root.children!.filter(prune)

  const out = await elk.layout(root)

  const result: LayoutResult = { nodes: new Map(), groups: new Map(), edges: new Map() }
  // shapeCoords=ROOT: every x/y is already absolute
  const walk = (n: ElkNode, depth: number) => {
    for (const c of n.children ?? []) {
      const x = c.x ?? 0
      const y = c.y ?? 0
      if (c.id.startsWith(GROUP_PREFIX)) {
        result.groups.set(c.id.slice(GROUP_PREFIX.length), { x, y, width: c.width ?? 0, height: c.height ?? 0, depth })
        walk(c, depth + 1)
      } else {
        result.nodes.set(c.id, { x, y })
      }
    }
  }
  walk(out, 0)

  const collectEdges = (n: ElkNode) => {
    for (const e of (n.edges ?? []) as ElkExtendedEdge[]) {
      const s = e.sections?.[0]
      if (!s) continue
      const points = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({ x: p.x, y: p.y }))
      const l = e.labels?.[0]
      let label = l && l.x !== undefined ? { x: l.x + (l.width ?? 0) / 2, y: (l.y ?? 0) + (l.height ?? 0) / 2 } : undefined
      // ELK occasionally skips a label (leaving it at the container origin). Keep ELK's spot
      // when the label *box* touches the route; measuring from the centre would reject wide
      // pills sitting beside a vertical segment.
      const labelPlaced = !!l && l.x !== undefined &&
        rectDistToPolyline({ x: l.x, y: l.y ?? 0, w: l.width ?? 0, h: l.height ?? 0 }, points) <= 12
      if (!labelPlaced) label = fallbackLabelPoint(points, horizontal)
      const src = graph.edges[Number(e.id.slice(EDGE_PREFIX.length))]
      if (src) result.edges.set(edgeId(src, Number(e.id.slice(EDGE_PREFIX.length))), { points, label, labelPlaced })
    }
    for (const c of n.children ?? []) collectEdges(c)
  }
  collectEdges(out)
  return result
}

/** Distance from a polyline to an axis-aligned rectangle (0 when they touch). */
function rectDistToPolyline(r: { x: number; y: number; w: number; h: number }, pts: Point[]): number {
  let best = Infinity
  const toRect = (p: Point) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.h))
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2))
    for (let k = 0; k <= steps; k++) {
      best = Math.min(best, toRect({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps }))
      if (best === 0) return 0
    }
  }
  return best
}

/** Middle of the longest segment running along the layout direction (labels are wide pills). */
function fallbackLabelPoint(pts: Point[], horizontal: boolean): Point {
  let best = -1, mid = pts[0]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const along = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)
    if (along > best) { best = along; mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }
  return mid
}
