---
name: codeflow
description: >
  Map a codebase (or one slice of it) into an interactive, n8n-style flow graph and open it in a
  React viewer: circular nodes for entrypoints / structs / traits / functions, edges for calls and
  data flow, module groups, semantic zoom (zoom out = macro architecture, zoom in = types, payloads,
  summaries), hover cards with fields + code, a click-to-open inspector with the real source, and
  step-by-step "flow" tours (e.g. main → Server → Router → impl Handler → Store).
  Use when the user asks to visualize, map, diagram or "show me how X flows" in a repo, wants a
  codebase graph / architecture map / call-flow / data-flow visual, or runs /codeflow.
metadata:
  short-description: "Agent-mapped codebase flow graph (React Flow viewer)"
---

# Codeflow

You read the repo, write a **graph JSON** describing how it works, and the bundled viewer renders it.
The viewer is fixed; your only output is the JSON (and running the viewer).

```
codeflow/                     ← the skill directory (wherever this SKILL.md lives)
├── SKILL.md                  ← this file
├── references/schema.md      ← every JSON field, with guidance — read before writing a graph
└── viewer/                   ← Vite + React + @xyflow/react + ELK. Do not edit for normal use.
    ├── graphs/example.json   ← a complete example (Rust KV server) — copy its shape
    └── scripts/cli.ts        ← `hydrate` (pull real code from disk) and `check` (validate)
```

Below, `$V` is the `viewer/` folder next to this file. Commands use [bun](https://bun.sh). If `bun`
is not on PATH, run it through whatever the machine provides (e.g. on NixOS
`nix shell nixpkgs#bun -c bun …`); don't install it globally without asking.

## Workflow

### 1. Scope
- Default: the **whole repo**, one overview graph. If the user named a feature, flow, or directory
  ("how does auth work", "the ingest pipeline"), map only that slice.
- Big repo (> ~40 meaningful nodes): make **several graphs** — `overview.json` (subsystems and
  their main types) plus one per subsystem/flow (`ingest.json`, `auth.json`). The viewer shows a
  graph picker when the folder has more than one file.
- Output folder: `<repo>/.codeflow/`. Create it. Don't touch `.gitignore` unless asked.

### 2. Map the code (the actual work)
Read; don't guess. For every node you add you must have opened the file.

1. **Find entrypoints**: `main.rs`/`bin/*`, `cmd/*/main.go`, `main.py`/`__main__.py`/CLI
   entry_points in `pyproject.toml`, `package.json` `bin`/`main`/framework routes, `Program.cs`,
   server bootstraps, worker/queue consumers, exported library API for libs.
2. **Trace from the entry**, following what happens to the data: what gets constructed, what it's
   handed to, which trait/interface it is called through, which impl actually runs, where state is
   read/written, what crosses process boundaries (DB, network, FS, queues).
3. **Choose nodes**: the types and functions a new engineer must know to follow the flow. Put a
   struct's methods *inside* its node (`methods`); give a method its own node only when it is a
   major step. Skip trivial helpers, getters, and generated code. Trait/interface + its impls are
   separate nodes joined by `impl` edges. External systems (Postgres, S3, Kafka, OS) are `external`
   or `store` nodes.
4. **Edges point the way control or data moves.** Prefer specific kinds: `data` (value handed on,
   put the type in `payload`), `calls`, `impl`, `owns`, `reads`/`writes`, `emits`, `returns`.
   Label with the real function name (`dispatch`, `Engine::open`).
5. **Groups** = modules / packages / top-level directories. Nest with `parent` when useful.
6. **Flows (tours)**: 1–3 named walkthroughs of the most important paths (startup, a request
   lifecycle, a write path). Each step is a node plus one or two sentences that *narrate the data*.
7. **importance**: 3 for the spine of the main flow (bigger circles, fade last), 1 for
   supporting detail (fades first when zoomed out), 2 otherwise.

### 3. Write the JSON
Read `references/schema.md`, then write `<repo>/.codeflow/<name>.json`.
**Never type code into the JSON.** Give `snippet: { "start": N, "end": M }` (the key 8–14 lines,
shown on hover) and `code: { "start": N, "end": M }` (the whole function/impl, shown in the
inspector). `hydrate` fills `code` from disk. Use `highlight: [lines]` for the lines that matter.

Set `meta.root` to the repo's absolute path (for hydrate and for editor links).

### 4. Hydrate + check (loop until clean)
```bash
cd $V
bun scripts/cli.ts hydrate <repo>/.codeflow/overview.json
bun scripts/cli.ts check   <repo>/.codeflow        # whole folder
```
Fix every ✗. Fix ⚠ when it's a real gap (missing summary, orphan node, stale snippet).

### 5. Show it
First run: `cd $V && bun install` if `node_modules/` is missing.

- **Live** (default): start in the background and give the user the URL.
  ```bash
  cd $V && CODEFLOW_GRAPHS=<repo>/.codeflow PORT=5199 bun run dev
  ```
  Editing the JSON hot-reloads. New files in the folder need a restart.
- **Single HTML file** (to share/open offline):
  ```bash
  cd $V && CODEFLOW_GRAPHS=<repo>/.codeflow CODEFLOW_OUT=<repo>/.codeflow/site bun run build
  ```
  → `<repo>/.codeflow/site/index.html` (~2 MB, self-contained except web fonts).

Command for the user to run it again later (`env` keeps it valid in bash, zsh and fish):
`cd $V; env CODEFLOW_GRAPHS=<repo>/.codeflow bun run dev`

Deep links: `#g=<graph>&n=<nodeId>` (select node), `#flow=<flowId>` (start a tour), `#theme=light|dark`,
`#peek=<nodeId>` (open a hover card; handy for headless screenshots).

### 6. Report
Tell the user: what you mapped (scope, node/edge counts, the flows), the URL or HTML path, and
anything you left out on purpose or weren't sure about (dynamic dispatch you couldn't resolve,
macro-generated code, reflection).

## What the viewer does with your fields

| Zoom / action | Shows | Comes from |
|---|---|---|
| Zoomed out (macro) | circles, big labels, group names | `label`, `kind`, `group`, `importance` |
| Mid | + kind · file, edge labels | `file`, edge `label`/`kind` |
| Zoomed in (micro) | + 2-line summary, counts, edge payload types | `summary`, `fields`/`methods`/`steps`, edge `payload` |
| Hover | paper card: summary, signature, in→out, fields, methods, "flow inside", snippet | `signature`, `inputs`/`outputs`, `steps`, `snippet` |
| Click | inspector: full code, field notes, method notes, all connections | `code`, `note`s, edges |
| Flow tour | numbered badges, camera follows, caption per step | `flows[].steps[].note` |

So: `summary` is one plain sentence about what it does and why it exists, not a restatement of the
name. `steps` (3–6) narrate data moving *inside* a node. `inputs`/`outputs` are the data contract.

## Customizing the viewer
Only when the user asks. Kind → colour/icon mapping: `viewer/src/lib/theme.ts`. Pastel palette (`--c-*`, light + dark) + zoom
thresholds (`.lod-mid`, `.lod-micro`): `viewer/src/styles.css`. Circle sizes: `DIAMETER` in
`viewer/src/nodes/CodeNodeView.tsx`. Layout spacing: `viewer/src/lib/layout.ts`.
Run `bun run build` in `$V` (typechecks + builds) after changes.
