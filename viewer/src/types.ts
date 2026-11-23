// Codeflow graph schema (v1). The agent writes JSON files matching `CodeGraph`.
// Full reference: ../references/schema.md

export type NodeKind =
  | 'entry'      // main(), CLI entrypoint, HTTP server bootstrap, worker start
  | 'function'
  | 'method'
  | 'struct'
  | 'class'
  | 'enum'
  | 'trait'      // also: interface, protocol, abstract base
  | 'interface'
  | 'type'       // alias, DTO, schema, message type
  | 'module'
  | 'handler'    // route/RPC/event handler
  | 'config'
  | 'store'      // DB, cache, repository, state container
  | 'external'   // 3rd-party service, OS, network, filesystem
  | 'event'      // queue topic, channel, signal

export type EdgeKind =
  | 'calls'    // A invokes B
  | 'data'     // data value flows A -> B (put the type in `payload`)
  | 'returns'  // B gets a value back from A
  | 'impl'     // struct/class A implements trait/interface B
  | 'owns'     // A holds / constructs B (field, composition)
  | 'uses'     // generic dependency
  | 'reads'
  | 'writes'
  | 'emits'    // A publishes an event / sends on channel B

export interface Field {
  name: string
  type?: string
  note?: string
}

export interface Method {
  name: string
  signature?: string
  note?: string
  line?: number
}

/** One step of the data flow *inside* a node (micro level). */
export interface Step {
  label: string
  detail?: string
  line?: number
}

/**
 * A slice of source code. Prefer giving `start`/`end` (1-based, inclusive) and
 * letting `bun run hydrate` fill `code` from disk, so snippets are never invented.
 */
export interface Snippet {
  file?: string       // repo-relative; defaults to the node's `file`
  start?: number
  end?: number
  code?: string
  lang?: string       // inferred from extension when omitted
  highlight?: number[] // absolute line numbers to emphasise
}

export interface CodeNode {
  id: string
  label: string
  kind: NodeKind
  group?: string
  file?: string
  line?: number
  signature?: string
  summary?: string
  tags?: string[]
  implements?: string[]
  inputs?: Field[]
  outputs?: Field[]
  fields?: Field[]
  methods?: Method[]
  steps?: Step[]
  /** Short preview rendered inside the node (keep it under ~14 lines). */
  snippet?: Snippet
  /** Full code shown in the inspector when the node is selected. Falls back to `snippet`. */
  code?: Snippet
  /** 3 = core path, 2 = normal (default), 1 = supporting detail (fades first on zoom-out). */
  importance?: 1 | 2 | 3
}

export interface CodeEdge {
  id?: string
  source: string
  target: string
  kind?: EdgeKind
  label?: string
  payload?: string
  note?: string
  async?: boolean
}

export interface Group {
  id: string
  label: string
  parent?: string
  description?: string
  color?: string
}

export interface FlowStep {
  node: string
  note?: string
}

export interface Flow {
  id: string
  title: string
  description?: string
  steps: FlowStep[]
}

export interface CodeGraph {
  version: 1
  meta: {
    title: string
    description?: string
    repo?: string
    root?: string          // absolute path of the repo on disk (for editor links + hydrate)
    commit?: string
    language?: string
    generatedAt?: string
    /** e.g. "vscode://file/{abs}:{line}" or "zed://file/{abs}:{line}". {path} = repo-relative. */
    linkTemplate?: string
  }
  groups?: Group[]
  nodes: CodeNode[]
  edges: CodeEdge[]
  flows?: Flow[]
}
