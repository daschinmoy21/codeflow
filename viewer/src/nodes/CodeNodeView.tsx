import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { CodeNode } from '../types'
import { KIND_META } from '../lib/theme'
import { useView } from '../lib/context'

export type CodeFlowNode = Node<{ node: CodeNode; order: number }, 'code'>

/** Circle diameter per importance (3 = core path). */
export const DIAMETER = { 1: 52, 2: 68, 3: 86 } as const

// Level of detail is CSS-driven from --z (see styles.css):
//   macro  -> circle + big label
//   mid    -> + kind / file
//   micro  -> + one-line summary and stats under the label
// Full rectangular card appears on hover; inspector on select.
export const CodeNodeView = memo(function CodeNodeView({ data, selected }: NodeProps<CodeFlowNode>) {
  const n = data.node
  const { direction, tourSteps, tourCurrent, groupColors } = useView()
  const meta = KIND_META[n.kind] ?? KIND_META.function
  const Icon = meta.icon
  const steps = tourSteps.get(n.id)
  const horizontal = direction === 'RIGHT'
  const d = DIAMETER[n.importance ?? 2]
  const stats = [
    n.fields?.length && `${n.fields.length} fields`,
    n.methods?.length && `${n.methods.length} methods`,
    n.steps?.length && `${n.steps.length} steps`,
    n.snippet?.code && `${n.snippet.code.split('\n').length} loc`,
  ].filter(Boolean)

  return (
    <div
      className={[
        'cf-node',
        horizontal ? 'label-below' : 'label-right',
        `imp-${n.importance ?? 2}`,
        selected ? 'is-selected' : '',
        tourCurrent === n.id ? 'is-current' : '',
      ].join(' ')}
      style={{
        '--accent': meta.color,
        '--group': (n.group && groupColors.get(n.group)) || meta.color,
        '--d': `${d}px`,
        '--delay': `${Math.min(data.order * 35, 900)}ms`,
      } as React.CSSProperties}
    >
      <Handle type="target" position={horizontal ? Position.Left : Position.Top} />
      <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} />

      <div className="cf-orb">
        <div className="cf-orb-ring" />
        <div className="cf-orb-core">
          <Icon size={Math.round(d * 0.36)} strokeWidth={2} />
        </div>
        {steps && (
          <span className="cf-steps">
            {steps.map((s) => <b key={s}>{s}</b>)}
          </span>
        )}
      </div>

      <div className="cf-label">
        <span className="cf-label-name">{n.label}</span>
        <span className="cf-label-kind lod-mid">{meta.label}{n.file ? ` · ${n.file.split('/').pop()}` : ''}</span>
        {n.summary && <span className="cf-label-sum lod-micro">{n.summary}</span>}
        {stats.length > 0 && <span className="cf-label-stats lod-micro">{stats.join(' · ')}</span>}
      </div>
    </div>
  )
})
