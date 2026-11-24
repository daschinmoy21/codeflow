import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import type { CodeEdge } from '../types'
import type { EdgeRoute, Point } from '../lib/layout'
import { EDGE_META } from '../lib/theme'

export interface Circle { cx: number; cy: number; r: number }

export type FlowEdge = Edge<{
  edge: CodeEdge
  active: boolean
  dim: boolean
  /** ELK's orthogonal route; absent once an endpoint has been dragged away */
  route?: EdgeRoute
  src?: Circle
  tgt?: Circle
}, 'flow'>

const CORNER = 14

/** Move a route's end point from the node's bounding box onto the circle itself. */
function clipToCircle(end: Point, next: Point, c: Circle | undefined): Point {
  if (!c) return end
  const horizontal = Math.abs(next.y - end.y) < Math.abs(next.x - end.x)
  if (horizontal) {
    const dy = Math.min(Math.abs(end.y - c.cy), c.r * 0.92)
    const dx = Math.sqrt(c.r * c.r - dy * dy)
    let x = c.cx + (next.x > c.cx ? dx : -dx)
    // never slide past the first bend, or the segment would fold back on itself
    if ((next.x - end.x) * (next.x - x) <= 0) x = next.x - Math.sign(next.x - end.x) * 2
    return { x, y: end.y }
  }
  const dx = Math.min(Math.abs(end.x - c.cx), c.r * 0.92)
  const dy = Math.sqrt(c.r * c.r - dx * dx)
  let y = c.cy + (next.y > c.cy ? dy : -dy)
  if ((next.y - end.y) * (next.y - y) <= 0) y = next.y - Math.sign(next.y - end.y) * 2
  return { x: end.x, y }
}

/** Polyline → SVG path with rounded corners. */
function roundedPath(pts: Point[]): string {
  // drop zero-length and collinear points so corners are real corners
  const p: Point[] = []
  for (const q of pts) {
    const last = p[p.length - 1]
    if (last && Math.hypot(q.x - last.x, q.y - last.y) < 0.5) continue
    if (p.length >= 2) {
      const a = p[p.length - 2], b = last!
      const cross = (b.x - a.x) * (q.y - b.y) - (b.y - a.y) * (q.x - b.x)
      if (Math.abs(cross) < 0.5 * Math.hypot(b.x - a.x, b.y - a.y)) p.pop()
    }
    p.push(q)
  }
  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1]
    const l1 = Math.hypot(b.x - a.x, b.y - a.y)
    const l2 = Math.hypot(c.x - b.x, c.y - b.y)
    const r = Math.min(CORNER, l1 / 2, l2 / 2)
    const s = { x: b.x + ((a.x - b.x) / l1) * r, y: b.y + ((a.y - b.y) / l1) * r }
    const e = { x: b.x + ((c.x - b.x) / l2) * r, y: b.y + ((c.y - b.y) / l2) * r }
    d += ` L ${s.x} ${s.y} Q ${b.x} ${b.y} ${e.x} ${e.y}`
  }
  const z = p[p.length - 1]
  return d + ` L ${z.x} ${z.y}`
}

export const FlowEdgeView = memo(function FlowEdgeView(props: EdgeProps<FlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected } = props
  const { edge: e, route, src, tgt, active, dim } = data!
  const meta = EDGE_META[e.kind ?? 'calls'] ?? EDGE_META.calls

  let path: string
  let lx: number
  let ly: number
  let floating = false
  if (route && route.points.length >= 2) {
    const pts = route.points.slice()
    pts[0] = clipToCircle(pts[0], pts[1], src)
    pts[pts.length - 1] = clipToCircle(pts[pts.length - 1], pts[pts.length - 2], tgt)
    path = roundedPath(pts)
    const mid = route.label ?? pts[Math.floor(pts.length / 2)]
    floating = !route.labelPlaced
    lx = mid.x
    ly = mid.y
  } else {
    ;[path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.3 })
  }

  const cls = ['cf-edge', meta.animated || e.async ? 'is-animated' : '', active ? 'is-active' : '', dim ? 'is-dim' : '', selected ? 'is-selected' : ''].join(' ')
  const text = e.label ?? meta.label

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        className={cls}
        style={{ stroke: `color-mix(in srgb, ${meta.color} var(--edge-mix), var(--text))`, strokeDasharray: meta.dash }}
        interactionWidth={18}
      />
      <EdgeLabelRenderer>
        <div
          className={`cf-edge-label ${floating ? 'is-floating' : 'lod-mid'} ${dim ? 'is-dim' : ''} ${active ? 'is-active' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, '--edge': meta.color } as React.CSSProperties}
          title={e.note ?? (e.payload ? `${text}: ${e.payload}` : text)}
        >
          <span className="cf-edge-kind">
            {text}
            {e.async && <span className="cf-edge-async">async</span>}
          </span>
          {e.payload && <code className="cf-edge-payload">{e.payload}</code>}
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
