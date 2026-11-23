import { memo } from 'react'
import { ArrowRight } from 'lucide-react'
import type { CodeNode } from '../types'
import { KIND_META } from '../lib/theme'
import { CodeBlock } from './CodeBlock'

const MAX_ROWS = 8

/** The rectangular "explain" card: shown next to a node on hover. */
export const NodeCard = memo(function NodeCard({ node: n, groupLabel }: { node: CodeNode; groupLabel?: string }) {
  const meta = KIND_META[n.kind] ?? KIND_META.function
  const Icon = meta.icon
  return (
    <div className="cf-card" style={{ '--accent': meta.color } as React.CSSProperties}>
      <header className="cf-head">
        <span className="cf-icon"><Icon size={15} strokeWidth={2.2} /></span>
        <span className="cf-title" title={n.label}>{n.label}</span>
        <span className="cf-kind">{meta.label}{groupLabel ? ` · ${groupLabel}` : ''}</span>
      </header>

      <div className="cf-body">
        {n.file && <div className="cf-file">{n.file}{n.line ? `:${n.line}` : ''}</div>}
        {n.summary && <p className="cf-summary">{n.summary}</p>}
        {n.signature && <code className="cf-sig">{n.signature}</code>}

        {(n.tags?.length || n.implements?.length) ? (
          <div className="cf-chips">
            {n.implements?.map((t) => <span key={'i' + t} className="cf-chip impl">impl {t}</span>)}
            {n.tags?.map((t) => <span key={t} className="cf-chip">{t}</span>)}
          </div>
        ) : null}

        {(n.inputs?.length || n.outputs?.length) ? (
          <div className="cf-io">
            <div className="cf-io-col">
              <span className="cf-sec">in</span>
              {n.inputs?.map((f) => <span key={f.name} className="cf-io-item"><b>{f.name}</b>{f.type && <i>{f.type}</i>}</span>)}
            </div>
            <ArrowRight size={14} className="cf-io-arrow" />
            <div className="cf-io-col">
              <span className="cf-sec">out</span>
              {n.outputs?.map((f) => <span key={f.name} className="cf-io-item"><b>{f.name}</b>{f.type && <i>{f.type}</i>}</span>)}
            </div>
          </div>
        ) : null}

        {n.fields?.length ? (
          <section>
            <div className="cf-sec">fields</div>
            <ul className="cf-rows">
              {n.fields.slice(0, MAX_ROWS).map((f) => (
                <li key={f.name}><span className="cf-name">{f.name}</span>{f.type && <span className="cf-type">{f.type}</span>}</li>
              ))}
              {n.fields.length > MAX_ROWS && <li className="cf-more">+{n.fields.length - MAX_ROWS} more</li>}
            </ul>
          </section>
        ) : null}

        {n.methods?.length ? (
          <section>
            <div className="cf-sec">methods</div>
            <ul className="cf-rows">
              {n.methods.slice(0, MAX_ROWS).map((m) => (
                <li key={m.name}><span className="cf-name fn">{m.name}</span>{m.signature && <span className="cf-type">{m.signature}</span>}</li>
              ))}
              {n.methods.length > MAX_ROWS && <li className="cf-more">+{n.methods.length - MAX_ROWS} more</li>}
            </ul>
          </section>
        ) : null}

        {n.steps?.length ? (
          <section>
            <div className="cf-sec">flow inside</div>
            <ol className="cf-flow">
              {n.steps.map((s, i) => (
                <li key={i}>
                  <span className="cf-flow-n">{i + 1}</span>
                  <span>{s.label}{s.detail && <span className="cf-flow-d">{s.detail}</span>}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {n.snippet?.code && <CodeBlock className="cf-node-code" snippet={n.snippet} fallbackFile={n.file} maxLines={12} />}
        <div className="cf-card-hint">click for full code & connections</div>
      </div>
    </div>
  )
})
