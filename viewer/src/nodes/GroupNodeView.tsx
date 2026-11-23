import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'

export type GroupFlowNode = Node<{ label: string; description?: string; color: string; depth: number }, 'cluster'>

export const GroupNodeView = memo(function GroupNodeView({ data }: NodeProps<GroupFlowNode>) {
  return (
    <div className={`cf-group depth-${Math.min(data.depth, 3)}`} style={{ '--group': data.color } as React.CSSProperties}>
      <div className="cf-group-label">
        <span>{data.label}</span>
        {data.description && <small className="lod-mid">{data.description}</small>}
      </div>
    </div>
  )
})
