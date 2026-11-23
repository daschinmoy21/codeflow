import { X, ExternalLink, Copy, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { CodeGraph, CodeNode } from '../types'
import { EDGE_META, KIND_META } from '../lib/theme'
import { editorLink } from '../lib/context'
import { CodeBlock } from './CodeBlock'

interface Props {
  graph: CodeGraph
  node: CodeNode
  onClose: () => void
  onNavigate: (id: string) => void
}

export function Inspector({ graph, node: n, onClose, onNavigate }: Props) {
  const meta = KIND_META[n.kind] ?? KIND_META.function
  const Icon = meta.icon
  const byId = new Map(graph.nodes.map((x) => [x.id, x]))
  const incoming = graph.edges.filter((e) => e.target === n.id)
  const outgoing = graph.edges.filter((e) => e.source === n.id)
  const code = n.code?.code ? n.code : n.snippet
  const link = editorLink(graph, code?.file ?? n.file, code?.start ?? n.line)
  const loc = n.file ? `${n.file}${n.line ? `:${n.line}` : ''}` : undefined

  return (
    <aside className="cf-inspector nowheel" style={{ '--accent': meta.color } as React.CSSProperties}>
      <header className="cf-ins-head">
        <span className="cf-icon"><Icon size={16} /></span>
        <div className="cf-ins-title">
          <h2>{n.label}</h2>
          <span className="cf-kind">{meta.label}{n.group ? ` · ${graph.groups?.find((g) => g.id === n.group)?.label ?? n.group}` : ''}</span>
        </div>
        <button className="cf-icon-btn" onClick={onClose} title="Close (Esc)"><X size={16} /></button>
      </header>

      <div className="cf-ins-body">
        {loc && (
          <div className="cf-ins-loc">
            <code>{loc}</code>
            <button className="cf-icon-btn" title="Copy path" onClick={() => navigator.clipboard?.writeText(loc)}><Copy size={13} /></button>
            {link && <a className="cf-icon-btn" href={link} title="Open in editor"><ExternalLink size={13} /></a>}
          </div>
        )}
        {n.summary && <p className="cf-ins-summary">{n.summary}</p>}
        {n.signature && <code className="cf-sig block">{n.signature}</code>}
        {(n.tags?.length || n.implements?.length) ? (
          <div className="cf-chips">
            {n.implements?.map((t) => <span key={'i' + t} className="cf-chip impl">impl {t}</span>)}
            {n.tags?.map((t) => <span key={t} className="cf-chip">{t}</span>)}
          </div>
        ) : null}

        {code?.code ? (
          <section>
            <h3>Code {code.start ? <small>lines {code.start}–{code.end ?? code.start + code.code.split('\n').length - 1}</small> : null}</h3>
            <CodeBlock snippet={code} fallbackFile={n.file} className="cf-ins-code" />
          </section>
        ) : null}

        {(n.inputs?.length || n.outputs?.length) ? (
          <section className="cf-ins-io">
            <div>
              <h3>Inputs</h3>
              <FieldTable rows={n.inputs ?? []} />
            </div>
            <div>
              <h3>Outputs</h3>
              <FieldTable rows={n.outputs ?? []} />
            </div>
          </section>
        ) : null}

        {n.fields?.length ? (
          <section><h3>Fields</h3><FieldTable rows={n.fields} /></section>
        ) : null}

        {n.methods?.length ? (
          <section>
            <h3>Methods</h3>
            <ul className="cf-ins-list">
              {n.methods.map((m) => (
                <li key={m.name}>
                  <code className="fn">{m.signature ?? m.name}</code>
                  {m.line && <span className="cf-dim">:{m.line}</span>}
                  {m.note && <p>{m.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {n.steps?.length ? (
          <section>
            <h3>Flow inside</h3>
            <ol className="cf-flow big">
              {n.steps.map((s, i) => (
                <li key={i}>
                  <span className="cf-flow-n">{i + 1}</span>
                  <span>{s.label}{s.line && <span className="cf-dim"> :{s.line}</span>}{s.detail && <span className="cf-flow-d">{s.detail}</span>}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section>
          <h3>Connections</h3>
          <ul className="cf-conn">
            {incoming.map((e, i) => (
              <ConnRow key={'in' + i} dir="in" kind={e.kind} label={e.label} payload={e.payload} other={byId.get(e.source)} onClick={() => onNavigate(e.source)} />
            ))}
            {outgoing.map((e, i) => (
              <ConnRow key={'out' + i} dir="out" kind={e.kind} label={e.label} payload={e.payload} other={byId.get(e.target)} onClick={() => onNavigate(e.target)} />
            ))}
            {!incoming.length && !outgoing.length && <li className="cf-dim">none</li>}
          </ul>
        </section>
      </div>
    </aside>
  )
}

function FieldTable({ rows }: { rows: { name: string; type?: string; note?: string }[] }) {
  if (!rows.length) return <p className="cf-dim">—</p>
  return (
    <table className="cf-table">
      <tbody>
        {rows.map((f) => (
          <tr key={f.name}>
            <td className="cf-name">{f.name}</td>
            <td><code className="cf-type">{f.type}</code>{f.note && <div className="cf-note">{f.note}</div>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ConnRow(p: { dir: 'in' | 'out'; kind?: string; label?: string; payload?: string; other?: CodeNode; onClick: () => void }) {
  const em = EDGE_META[(p.kind ?? 'calls') as keyof typeof EDGE_META] ?? EDGE_META.calls
  return (
    <li>
      <button onClick={p.onClick} style={{ '--edge': em.color } as React.CSSProperties}>
        {p.dir === 'in' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
        <span className="cf-conn-kind">{p.label ?? em.label}</span>
        <span className="cf-conn-node">{p.other?.label ?? '?'}</span>
        {p.payload && <code>{p.payload}</code>}
      </button>
    </li>
  )
}
