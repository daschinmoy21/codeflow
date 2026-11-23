import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js'
import type { CodeGraph } from '../types'

const elk = new ELK()

export type Direction = 'RIGHT' | 'DOWN'

export interface LayoutResult {
  nodes: Map<string, { x: number; y: number }>
  groups: Map<string, { x: number; y: number; width: number; height: number; depth: number }>
}

const GROUP_PREFIX = '__group__'

/**
 * Hierarchical layered layout. Groups become ELK compound nodes so every
 * module's members stay inside one box; edges cross boundaries freely.
 */
export async function layoutGraph(
  graph: CodeGraph,
  sizes: Map<string, { width: number; height: number }>,
  direction: Direction,
): Promise<LayoutResult> {
  const groupIds = new Set((graph.groups ?? []).map((g) => g.id))
  const elkGroups = new Map<string, ElkNode>()
  for (const g of graph.groups ?? []) {
    elkGroups.set(g.id, {
      id: GROUP_PREFIX + g.id,
      children: [],
      layoutOptions: {
        'elk.padding': '[top=64,left=32,bottom=32,right=32]',
      },
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
      'elk.layered.spacing.nodeNodeBetweenLayers': '170',
      'elk.spacing.nodeNode': '64',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.spacing.componentComponent': '120',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
  }

  // nest groups
  for (const g of graph.groups ?? []) {
    const node = elkGroups.get(g.id)!
    const parent = g.parent && groupIds.has(g.parent) ? elkGroups.get(g.parent)! : root
    parent.children!.push(node)
  }

  for (const n of graph.nodes) {
    const size = sizes.get(n.id) ?? { width: 380, height: 200 }
    const parent = n.group && groupIds.has(n.group) ? elkGroups.get(n.group)! : root
    parent.children!.push({ id: n.id, width: size.width, height: size.height })
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  root.edges = graph.edges
    .filter((e) => e.source !== e.target && nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e, i): ElkExtendedEdge => ({ id: `e${i}`, sources: [e.source], targets: [e.target] }))

  // ELK fails on empty compound nodes — drop them
  const prune = (n: ElkNode): boolean => {
    if (!n.id.startsWith(GROUP_PREFIX)) return true
    n.children = (n.children ?? []).filter(prune)
    return n.children.length > 0
  }
  root.children = root.children!.filter(prune)

  const out = await elk.layout(root)

  const result: LayoutResult = { nodes: new Map(), groups: new Map() }
  const walk = (n: ElkNode, ox: number, oy: number, depth: number) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0)
      const y = oy + (c.y ?? 0)
      if (c.id.startsWith(GROUP_PREFIX)) {
        result.groups.set(c.id.slice(GROUP_PREFIX.length), { x, y, width: c.width ?? 0, height: c.height ?? 0, depth })
        walk(c, x, y, depth + 1)
      } else {
        result.nodes.set(c.id, { x, y })
      }
    }
  }
  walk(out, 0, 0, 0)
  return result
}
