import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import type { CodeEdge } from '../types'
import { EDGE_META } from '../lib/theme'

export type FlowEdge = Edge<{ edge: CodeEdge; active: boolean; dim: boolean }, 'flow'>

export const FlowEdgeView = memo(function FlowEdgeView(props: EdgeProps<FlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected } = props
  const e = data!.edge
  const meta = EDGE_META[e.kind ?? 'calls'] ?? EDGE_META.calls
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.3 })
  const cls = ['cf-edge', meta.animated || e.async ? 'is-animated' : '', data!.active ? 'is-active' : '', data!.dim ? 'is-dim' : '', selected ? 'is-selected' : ''].join(' ')
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
          className={`cf-edge-label lod-mid ${data!.dim ? 'is-dim' : ''} ${data!.active ? 'is-active' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, '--edge': meta.color } as React.CSSProperties}
          title={e.note}
        >
          <span className="cf-edge-kind">{text}</span>
          {e.payload && <code className="cf-edge-payload lod-micro">{e.payload}</code>}
          {e.async && <span className="cf-edge-async lod-micro">async</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
