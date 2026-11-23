import { Highlight, themes } from 'prism-react-renderer'
import { memo, useContext } from 'react'
import { ThemeContext } from '../lib/context'
import { langFromPath } from '../lib/theme'
import type { Snippet } from '../types'

interface Props {
  snippet: Snippet
  fallbackFile?: string
  maxLines?: number
  lineNumbers?: boolean
  className?: string
}

export const CodeBlock = memo(function CodeBlock({ snippet, fallbackFile, maxLines, lineNumbers = true, className }: Props) {
  const theme = useContext(ThemeContext)
  const raw = (snippet.code ?? '').replace(/\s+$/, '')
  if (!raw) return null
  const all = raw.split('\n')
  const clipped = maxLines && all.length > maxLines
  const code = clipped ? all.slice(0, maxLines).join('\n') : raw
  const start = snippet.start ?? 1
  const hl = new Set(snippet.highlight ?? [])
  const lang = snippet.lang ?? langFromPath(snippet.file ?? fallbackFile) ?? 'tsx'

  return (
    <div className={`cf-code ${className ?? ''}`}>
      <Highlight theme={theme === 'dark' ? themes.palenight : themes.oneLight} code={code} language={lang}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre>
            {tokens.map((line, i) => {
              const n = start + i
              const { className: lc, ...lp } = getLineProps({ line })
              return (
                <div key={i} {...lp} className={`${lc} cf-line ${hl.has(n) ? 'is-hl' : ''}`}>
                  {lineNumbers && <span className="cf-ln">{n}</span>}
                  <span className="cf-lc">
                    {line.map((token, k) => {
                      const { key: _k, ...tp } = getTokenProps({ token }) as ReturnType<typeof getTokenProps> & { key?: unknown }
                      return <span key={k} {...tp} />
                    })}
                  </span>
                </div>
              )
            })}
          </pre>
        )}
      </Highlight>
      {clipped && <div className="cf-code-more">+{all.length - maxLines!} more lines · select node for full code</div>}
    </div>
  )
})
