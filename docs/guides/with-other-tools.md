**English** · [Français](with-other-tools.fr.md)

# Composing the kit with other tools

**Summary.** A team that already works with a monorepo tool or a general method for agents adds
the kit to it; it does not choose between them. This guide says, tool by tool, where each one
acts, where both would act on the same moment and which one should hold it. Each section is
written from one real session on a small project, with the versions it ran and what had to be
worked around; a tool without its session is not described.

| Tool | Session | Verdict |
|---|---|---|
| [Nx](#nx) | 2026-11-20, Nx 24.0.6, `ddd-ts-kit` 0.114.1, npm 11.20, Node 26.13 | the kit project as one Nx project works, with `--package-manager npm` until [#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856) is fixed, the compiler path until [#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855) is, `vite` at the root and a `.prettierignore` |
| Spec Kit, BMAD, Superpowers | not yet run | tracked in [#317](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/317) |

## Nx

Nx holds the monorepo: its project graph, its task cache, `nx affected`, and the boundaries
between its projects (`@nx/enforce-module-boundaries`). The kit holds one backend inside it: its
bounded contexts, its layers, its glossary and the boundaries between its contexts. The two
graphs are not the same: Nx draws one between projects (packages, applications), the kit one
between the contexts of a single project.

**In short: one kit project is one Nx project.** Nx runs and caches its scripts, and decides
whether the backend is affected at all; the kit decides which contexts are, and judges every
import inside it. One Nx project per bounded context was tried too: it costs more, and it can
report a stale green (see [below](#one-nx-project-per-bounded-context-not-recommended)).

### The session

An empty Nx workspace (`npx create-nx-workspace@24.0.6 shop --preset=ts --pm=npm`, npm
workspaces over `packages/*`), then in `packages/api`:

```sh
npx ddd-ts-kit init --http hono --orm none --database none --ci none \
  --package-manager npm --context catalog:core --context ordering:core
npm install            # from the root of the workspace
npx nx run api:verify
```

Then, in a worktree opened by `npx ddd-ts-kit worktree first-slices`, as the guard asks: an
aggregate `Product` with its event `ProductListed` in `catalog`, the integration event
`catalog.product.listed@v1`, an aggregate `Order` in `ordering` and its consumer of that event,
`ordering` declaring `catalog` as its upstream. `nx run api:verify` was green. Then two forbidden
imports were written on purpose, one in each direction, to see which tool reports what.

The coding agent was Claude Code (Opus 5.5) with the plugin of the kit (0.113.2). Three more
sessions were then started at the root of the worktree with the Claude Code plugin that Nx
proposes in the `.claude/settings.json` of the workspace (`nx` 0.2.36, its skills and its MCP
server) loaded beside the plugin of the kit, each with one request that names neither tool: what
they chose is under *Agents* below.

### One Nx project for the kit project

Nx infers the project from the `package.json` of `packages/api`: every script becomes a target
(`nx run api:verify`, `nx run api:check:arch`), and the inferred `typecheck` of `@nx/js` gives way
to the script of the same name. What it took:

1. **The package manager of the workspace.** Started in an empty folder, `init` chose pnpm in a
   workspace installed by npm ([#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856)): pass `--package-manager` explicitly.
2. **The compiler path.** npm hoists `@typescript/native` to the root `node_modules`, so the
   `typecheck` and `build` scripts, which call `node node_modules/@typescript/native/bin/tsc`,
   fail with `Cannot find module` ([#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855)). Until it is fixed, point them at the root:
   `node ../../node_modules/@typescript/native/bin/tsc`.
3. **`vite` at the root.** npm placed `@vitest/mocker` at the root and `vite`, its optional peer,
   in `packages/api/node_modules`, so Vitest stopped at startup with
   `Cannot find package 'vite' imported from .../node_modules/@vitest/mocker`. `npm dedupe` did
   not move it; `npm install -D vite@8` at the root did. This is a placement of npm, not of the
   kit; teams that keep their tooling at the root, as Nx suggests, do not meet it.
4. **Prettier and Biome.** The workspace formats with Prettier (`nx format:check`, run by the CI
   Nx writes); the kit project formats with Biome at width 120. Prettier reported 94 files of the
   kit project. Add `packages/api` to the `.prettierignore` of the root: Biome holds that folder.
5. **The CI.** The workflow Nx writes runs `nx run-many -t lint test build typecheck e2e`: on the
   kit project that runs `ddd-ts-kit lint`, Vitest, the build and the type check, but not the
   architecture check, dependency-cruiser, knip or the contract check. Add the targets the kit
   puts in `verify` (`check:arch`, `depcruise`, `deadcode`, `docs:check`), or run `verify`
   itself. The `.github/` and `lefthook.yml` that `init` writes in `packages/api` never run there,
   as its note says: use `--ci none` and keep the CI of the workspace.

With these, `nx run api:verify` passed, then again in the worktree after the two slices.

**The cache.** `nx.json` declares no cache for inferred script targets. Declaring it works for the
checks of the kit; every file they read (`ddd-ts-kit.config.json`, the `CONTEXT.md` of each
context, the sources) lies under the project root, which is the default input:

```json
{
  "targetDefaults": {
    "typecheck": { "cache": true },
    "lint": { "cache": true },
    "check:arch": { "cache": true },
    "test": { "cache": true }
  }
}
```

A second `nx run-many -t typecheck lint check:arch test` read all four from the cache (8 ms).

**Affected, at two levels.** `nx affected` answers per project: a change in `catalog` gives `api`.
`npx ddd-ts-kit affected --base <ref>` answers per context inside it: a change in `catalog`
gives `catalog` and `ordering`, its downstream, with the spec globs of each. Keep both: Nx skips
the backend when a change does not reach it, and the scripts of the kit narrow inside it, as its
pre-push hook does with `affected --run ci:test:unit`.

### One Nx project per bounded context (not recommended)

A `project.json` in each context folder (`src/contexts/catalog/project.json` with
`"tags": ["scope:catalog"]`) makes each context an Nx project nested in `api`. What it needed:

- **The import alias of the kit at the root.** Nx resolves imports with the `paths` of the root
  `tsconfig.base.json`; the kit declares `@/*` in the `tsconfig.json` of its project, which Nx does
  not read. Without `"paths": { "@/*": ["packages/api/src/*"] }` at the root, the graph of Nx has
  no edge at all between the contexts, nor from `api` to them. That alias is then global to the
  workspace: two kit projects cannot both use `@/`. After changing it, run `nx reset`: the cached
  graph was not recomputed in this session.
- **`allowCircularSelfDependency: true`** in `@nx/enforce-module-boundaries`. Without it the rule
  reported 100 errors, one per import of the kit through `@/` inside a project ("Projects should
  use relative imports"): the generators of the kit write alias imports on purpose.
- **A tag on `api`** (`"nx": { "tags": ["type:app"] }` in its `package.json`) and a constraint that
  lets it depend on the contexts: the composition root imports every context.
- **The context map twice**: once in `ddd-ts-kit.config.json` (`upstreams`), once in the
  `depConstraints` of the rule. Nothing keeps them equal.

What it gained: nothing the kit did not already hold. And it showed one hazard:

**A stale green.** Without the root alias, the cache was warmed on a clean tree, then a forbidden
import was written in `ordering`: `nx run api:check:arch` answered from the cache,
`0 errors`, with the violation present. A file of a nested project is no longer an input of
`api`, and with no edge in the graph, no dependency brings it back. With the root alias and a
fresh graph, the same run was recomputed and failed as it should.

### Which tool reports what

Two forbidden imports, written by the agent with the rule of Nx enabled and the context map
`ordering` downstream of `catalog`:

| The import | the guard of the plugin (after the write) | `ddd-ts-kit check` | ESLint plugin of the kit | dependency-cruiser | `@nx/enforce-module-boundaries` |
|---|---|---|---|---|---|
| `ordering` imports the aggregate of `catalog` (its upstream, but not its published language) | `context/published-language-only` | same | same | same | nothing: `scope:ordering` may depend on `scope:catalog`, and the rule does not know which files of a project are its published language |
| `catalog` imports an event of `ordering` (against the map) | `context/published-language-only` | same | same | same | "Circular dependency between catalog and ordering" |

So inside a kit project the rule of Nx adds no finding, and on an import against the map it
reports the same line a second time, in other words. Use it where the kit does not look: between
projects of the workspace (a front end that must not import the backend, shared libraries).

When the project graph of Nx is not cached, the rule prints a warning to standard output and
skips itself; `ddd-ts-kit lint` then fails on that output ([#857](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/857)). `npx eslint` alone runs.

### Agents: two sets of instructions

`create-nx-workspace` writes instructions for agents at the root: an `AGENTS.md` and a
`CLAUDE.md` between `nx configuration` markers, skills under `.agents/skills` (`nx-generate`,
`nx-run-tasks`, ...), a `.claude/settings.json` that enables the plugin of Nx, and the same for
Cursor, Gemini CLI, Codex, OpenCode and Copilot. `init` writes the instructions of the kit in
`packages/api`. Where they meet:

| Moment | Nx says | The kit says | Who holds it |
|---|---|---|---|
| running a task | "always prefer running the task through nx" | `npm run verify`, `npx ddd-ts-kit check` | Nx at the root (`nx run api:verify`, `nx affected`); the commands of the kit inside `packages/api`, which its skills name |
| scaffolding | "ALWAYS invoke the `nx-generate` skill FIRST" | the generators of the kit, and the guard refuses a hand-written file of a kind they write | Nx for a new project of the workspace; the kit for anything inside a kit project |
| a session in the kit project | nothing | the guard: refuses code on the trunk, opens a worktree, judges each write, refuses `git commit --no-verify` | the kit: its guard found the config in `packages/api` and held every one of these in the session |

**Three sessions with both plugins.** Each was started at the root of the workspace with the plugin
of the kit and the plugin of Nx loaded together, and nothing added to the root `AGENTS.md`:

| Request | First skill | What it ran | Result |
|---|---|---|---|
| an aggregate `Customer` with its event in `ordering` | `ddd-ts-kit:scaffold` | `ddd-ts-kit generate aggregate`, then the checks of the kit through `npm run` and `npx ddd-ts-kit` | committed, no file written by hand |
| a new bounded context `billing`, downstream of `ordering` | `ddd-ts-kit:scaffold` | `ddd-ts-kit generate context` | committed |
| a shared library `money` for the api and a future front end | `nx:nx-generate`, citing the `CLAUDE.md` of the root | `nx g @nx/js:library` in `packages/money`, after reading the rules of the kit on value objects | committed |

`nx run-many -t verify typecheck test` was then green on both projects. So the last column held
without being written down: the kit for what lives inside its project, Nx for a new project of the
workspace. It is one session per request on one model; a smaller model, or a request that mixes a
folder of the kit project with the word "library", may choose otherwise. Inside the kit project
the agents ran the checks through `npm run` and `npx ddd-ts-kit`, not through Nx: the same
commands, without its cache. For the library, the generator of Nx added `@nx/vitest` and `vitest`
at the root and a Vitest plugin in `nx.json`; the agent excluded `packages/api` from that plugin,
which keeps its own Vitest configuration.

Write it down anyway, for other models and other agents: a line in the root `AGENTS.md`, outside the markers Nx rewrites,
that says `packages/api` is a ddd-ts-kit project and that its own `AGENTS.md` governs work inside
it. The permissions of the `.claude/settings.json` of `packages/api` are not read by a session
started at the root of the workspace.

**Worktrees.** `ddd-ts-kit worktree` opened the worktree under `packages/api/.worktrees/` and ran
`npm ci` at the root of the workspace inside it: each worktree is a whole copy of the workspace
with its own `node_modules` (521 MB here). Nx did not take it for a project (`packages/*` only
matches one level). Run Nx from the root of the worktree.

### What clashed, in short

| What | Where | Status |
|---|---|---|
| `typecheck` and `build` call `tsc` by a path a hoisted workspace breaks | the kit | [#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855) |
| `init` in a package of an npm workspace chose pnpm | the kit | [#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856) |
| `ddd-ts-kit lint` fails when an ESLint plugin writes to standard output | the kit | [#857](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/857) |
| `generate context <existing> --upstream <ctx>` records nothing and says nothing | the kit | [#858](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/858) |
| `vite` left beside the project while `@vitest/mocker` went to the root | npm | `vite` at the root |
| Prettier of the workspace against Biome of the project | both | `.prettierignore` |
| Nx reads `paths` from the root only, and asks relative imports inside a project | Nx | one Nx project for the kit project |
