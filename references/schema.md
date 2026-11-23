# Codeflow graph schema (v1)

Source of truth: `viewer/src/types.ts`. Complete example: `viewer/graphs/example.json`.

```jsonc
{
  "version": 1,
  "meta": {
    "title": "myrepo",                       // required
    "description": "one line shown under the title",
    "root": "/abs/path/to/repo",             // needed by hydrate/check and editor links
    "repo": "github.com/me/myrepo",
    "commit": "abc1234",
    "language": "rust",
    "linkTemplate": "vscode://file/{abs}:{line}"   // or "zed://file/{abs}:{line}", "cursor://file/{abs}:{line}"
  },
  "groups": [ { "id": "server", "label": "server", "description": "…", "parent": "app", "color": "#34518f" } ],
  "nodes":  [ /* CodeNode */ ],
  "edges":  [ /* CodeEdge */ ],
  "flows":  [ /* Flow */ ]
}
```

## CodeNode

| field | type | notes |
|---|---|---|
| `id` | string | **required**, unique, stable, kebab/snake (`put_handler`) |
| `label` | string | **required**, the real identifier (`PutHandler`, `Engine::open`) |
| `kind` | enum | **required**: `entry` `function` `method` `struct` `class` `enum` `trait` `interface` `type` `module` `handler` `config` `store` `external` `event` |
| `group` | string | a `groups[].id` |
| `file` | string | repo-relative path |
| `line` | number | 1-based definition line (hydrate fills from `snippet.start` if missing) |
| `importance` | 1 \| 2 \| 3 | 3 = main path (big circle), 1 = detail (fades first). Default 2 |
| `summary` | string | one sentence: what it does / why it exists |
| `signature` | string | fn signature or type header, verbatim from source |
| `tags` | string[] | `async`, `pub`, `#[derive(Clone)]`, `unsafe`, `generic`, … |
| `implements` | string[] | trait/interface names (also add `impl` edges) |
| `inputs` / `outputs` | Field[] | data contract: what flows in / out |
| `fields` | Field[] | struct fields / enum variants / class props |
| `methods` | Method[] | important methods on the type |
| `steps` | Step[] | 3–6 steps describing the data flow *inside* this node |
| `snippet` | Snippet | 8–14 key lines, shown in the hover card |
| `code` | Snippet | the whole definition, shown in the inspector (falls back to `snippet`) |

`Field = { name, type?, note? }` · `Method = { name, signature?, note?, line? }` · `Step = { label, detail?, line? }`

### Snippet
```jsonc
{ "file": "src/x.rs",   // optional, defaults to the node's file
  "start": 40, "end": 52, // 1-based inclusive; end defaults to start+11 (snippet) / start+59 (code)
  "highlight": [42, 43],  // absolute line numbers
  "lang": "rust",         // optional, inferred from extension
  "code": "…" }           // FILLED BY `hydrate`. Never write it by hand.
```
Highlighting languages built in: rust, go, python, tsx/jsx (ts/js), cpp (c/h), swift, kotlin, json, yaml,
graphql, markdown, objectivec. Others render as plain text.

## CodeEdge

| field | type | notes |
|---|---|---|
| `source`, `target` | node id | **required**. Direction = direction control/data moves |
| `kind` | enum | `calls` `data` `returns` `impl` `owns` `uses` `reads` `writes` `emits` (default `calls`) |
| `label` | string | the function/method/route name doing it (`dispatch`, `POST /items`) |
| `payload` | string | the type that travels (`Command → Response`, `&Config`, `Vec<Row>`) |
| `async` | bool | spawned / awaited / queued |
| `note` | string | tooltip |
| `id` | string | optional |

Conventions: `impl` goes **implementor → trait**. `owns` goes **owner → owned**. `reads`/`writes` go
**actor → store**.

## Flow
```jsonc
{ "id": "put", "title": "PUT request lifecycle", "description": "…",
  "steps": [ { "node": "conn", "note": "Conn::serve pulls a frame off the socket…" }, … ] }
```
5–10 steps. Notes narrate what the data looks like at that point and what changes.

## Size guidance
- 8–40 nodes per graph. More than that: split into several graphs.
- Every node should have at least one edge (`check` warns otherwise).
- `snippet` ≤ 14 lines; long code goes in `code`.
