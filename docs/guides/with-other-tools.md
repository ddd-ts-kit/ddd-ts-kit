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
| [Superpowers](#superpowers) | 2026-11-21, Superpowers 7.0.2, `ddd-ts-kit` 0.114.1, npm 11.19, Node 24.22 | the wording decides: a request that says what to build goes to the kit, an idea ("... Let's build it.") to `brainstorming` in most interactive sessions, which then conducts the whole feature; a section of `AGENTS.md` hands it back to the kit |
| Spec Kit, BMAD | not yet run | tracked in [#317](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/317) |

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

The coding agent was Claude Code (Opus 5.5) with the plugin of the kit installed then, 0.113.2,
one release behind the CLI. Three more sessions were then started at the root of that worktree,
which holds the whole workspace on a branch, with the Claude Code plugin that Nx
proposes in the `.claude/settings.json` of the workspace (`nx` 0.2.36, its skills and its MCP
server) loaded beside the plugin of the kit, each with one request that names neither tool: what
they chose is under *Agents* below.

### One Nx project for the kit project

Nx infers the project from the `package.json` of `packages/api`: every script becomes a target
(`nx run api:verify`, `nx run api:check:arch`), and the inferred `typecheck` of `@nx/js` gives way
to the script of the same name. What it took:

1. **The package manager of the workspace.** Started in an empty folder, `init` 0.114.1 chose
   pnpm in a workspace installed by npm
   ([#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856)): pass `--package-manager`
   explicitly there. The next release takes the package manager of the workspace and says in a
   note where it read it.
2. **The compiler path.** npm hoists `@typescript/native` to the root `node_modules`, so the
   `typecheck` and `build` scripts of 0.114.1, which call
   `node node_modules/@typescript/native/bin/tsc`, fail with `Cannot find module`
   ([#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855)). The next release writes
   `ddd-ts-kit tsc`, which finds the compiler wherever it is installed; on 0.114.1, point the two
   scripts at the root, `node ../../node_modules/@typescript/native/bin/tsc`.
3. **`vite` at the root.** npm placed `@vitest/mocker` at the root and `vite`, its optional peer,
   in `packages/api/node_modules`, so Vitest stopped at startup with
   `Cannot find package 'vite' imported from .../node_modules/@vitest/mocker`. `npm dedupe` did
   not move it; `npm install -D vite@8` at the root did. This is a placement of npm, not of the
   kit; teams that keep their tooling at the root, as Nx suggests, do not meet it.
4. **Prettier and Biome.** The workspace formats with Prettier (`nx format:check`, run by the CI
   Nx writes); the kit project formats with Biome at width 120. Prettier reported 94 files of the
   kit project. Add `packages/api` to the `.prettierignore` of the root: Biome holds that folder.
5. **The CI.** The workflow Nx writes runs `nx run-many -t lint test build typecheck e2e`: on the
   kit project that runs `ddd-ts-kit lint`, `vitest run`, the build and the type check, and
   nothing else `verify` runs: not the format check of Biome, the coverage thresholds
   (`test:coverage`), the end-to-end specs (`test:e2e`, which no `e2e` target matches), the
   architecture check, dependency-cruiser, knip or the contract check. Run `verify` itself
   (`nx affected -t verify`), or add each of its scripts as a target. The `.github/` that `init`
   writes in `packages/api` never runs there, as its note says: use `--ci none` and keep the CI
   of the workspace.
6. **The git hooks.** `init` writes `lefthook.yml` whatever `--ci` says, and lefthook reads it at
   the top of the git repository only: in `packages/api` no pre-commit, commit-msg or pre-push
   hook of the kit runs. Carry its commands into a hook configuration at the root of the
   workspace, run from `packages/api`, or the CI is the only gate.

With these, `nx run api:verify` passed, then again in the worktree after the two slices.

**The cache.** `nx.json` declares no cache for inferred script targets. Declaring it works for the
checks of the kit: the files they read (`ddd-ts-kit.config.json`, the `CONTEXT.md` of each
context, the sources) lie under the project root, which is the default input. One input lies
outside: `ddd-ts-kit check` asks git which files it ignores, and the root `.gitignore` answers
too, so a change to that file alone would replay an old `check:arch`. Name it among the inputs
(written from the source of the checker, not tried in the session):

```json
{
  "targetDefaults": {
    "typecheck": { "cache": true },
    "lint": { "cache": true },
    "check:arch": { "cache": true, "inputs": ["default", "{workspaceRoot}/.gitignore"] },
    "test": { "cache": true }
  }
}
```

With the cache declared, a second `nx run-many -t typecheck lint check:arch test` read all four
from the cache (8 ms).

**Affected, at two levels.** `nx affected` answers per project: a change in `catalog` gives `api`.
`npx ddd-ts-kit affected --base <ref>` answers per context inside it: a change in `catalog`
gives `catalog` and `ordering`, its downstream, with the spec globs of each. Keep both: Nx skips
the backend when a change does not reach it, and the scripts of the kit narrow inside it, as its
pre-push hook does with `affected --run ci:test:unit` once carried to the root (step 6).

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
| `catalog` imports a domain event of `ordering` (its downstream, against the map) | `context/published-language-only` | same | same | same | "Circular dependency between catalog and ordering" |

Both imports reached inside a context, so the kit reported both as
`context/published-language-only`. The map itself is held by `context/declared-relationship` and
`context/no-cycle`: an import of the published language of `ordering` from `catalog` would be
reported by those, a case this session did not write. So inside a kit project the rule of Nx
added no finding, and reported the second import a second time, as a cycle. Use it where the kit
does not look: between projects of the workspace (a front end that must not import the backend,
shared libraries).

When the project graph of Nx is not cached, the rule prints a warning to standard output and
skips itself; `ddd-ts-kit lint` 0.114.1 failed on that output
([#857](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/857)). The next release reads the answer of
ESLint apart and passes the warning on to standard error.

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
| a session in the kit project | nothing | the guard: refuses code on the trunk and names `npx ddd-ts-kit worktree <name>`, judges each write, refuses `git commit --no-verify` | the kit: its guard found the config in `packages/api` and held every one of these in the session |

**Three sessions with both plugins.** Each was started at the root of the workspace, in the
worktree of the session (on a branch, so the guard let code be written), with the plugin of the
kit and the plugin of Nx loaded together, and nothing added to the root `AGENTS.md`:

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

Write it down anyway, for other models and other agents: a line in the root `AGENTS.md`, outside the
markers Nx rewrites, that says `packages/api` is a ddd-ts-kit project and that its own `AGENTS.md`
governs work inside it. The permissions of the `.claude/settings.json` of `packages/api` are not
read by a session started at the root of the workspace.

**Worktrees.** `ddd-ts-kit worktree` opened the worktree under `packages/api/.worktrees/` and ran
`npm ci` at the root of the workspace inside it: each worktree is a whole copy of the workspace
with its own `node_modules` (521 MB here). Nx did not take it for a project (`packages/*` only
matches one level). Run Nx from the root of the worktree.

### What clashed, in short

| What | Where | Status |
|---|---|---|
| `typecheck` and `build` call `tsc` by a path a hoisted workspace breaks | the kit | [#855](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/855), fixed after 0.114.1 |
| `init` in a package of an npm workspace chose pnpm | the kit | [#856](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/856), fixed after 0.114.1 |
| `ddd-ts-kit lint` fails when an ESLint plugin writes to standard output | the kit | [#857](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/857), fixed after 0.114.1 |
| `generate context <existing> --upstream <ctx>` records nothing and says nothing | the kit | [#858](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/858), fixed after 0.114.1 |
| `vite` left beside the project while `@vitest/mocker` went to the root | npm | `vite` at the root |
| Prettier of the workspace against Biome of the project | both | `.prettierignore` |
| `lefthook.yml` written in the project, read at the top of the repository only | git hooks | its commands carried to the root |
| Nx reads `paths` from the root only, and asks relative imports inside a project | Nx | one Nx project for the kit project |

## Superpowers

Superpowers is a library of skills for a coding agent that conducts the work itself: a hook at
session start tells the agent to invoke a skill when there is "even a 1% chance" it applies, and
its skills set the process (`brainstorming` before any feature, `writing-plans`,
`executing-plans`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`,
`finishing-a-development-branch`). The kit holds the architecture of a backend and the steps
that build it (`use-case`, `plan-slices`, `testing`, `quality-gate`), and its guard judges each
write. Both have an opinion on the same moments: how a feature starts, how a plan is written,
how a test is written, who reviews.

**In short: the wording of the request decides who conducts.** A request that says what to build
("Add the ability for a member to borrow ...", "Members should be able to return ...") or asks
for a plan went to the skills of the kit every time. A request phrased as an idea ("We'd like
members to ... Let's build it."), the example the entry skill of Superpowers gives for
`brainstorming`, went to `brainstorming` in most interactive sessions; it then conducted the
whole feature, and the kit held only the code: its generators, its guard, its checks. Superpowers
ranks the instructions of the project above its skills, and a section of `AGENTS.md` hands such
a request back to the kit (tested below).

### The sessions

A project of the kit on its own, a library that lends book copies:

```sh
git init
npx ddd-ts-kit@0.114.1 init --package-manager npm --orm none --database none --ci none \
  --context lending:core
npm install && npm run verify
```

The coding agent was Claude Code (Opus 5.5) with the plugin of the kit installed (0.114.1) and
Superpowers 7.0.2 loaded from a clone by `--plugin-dir`, never installed; no request named either
tool. Three kinds of runs:

- **Four whole sessions in `claude -p`**, one request each, started on the trunk, the work of each
  merged before the next.
- **First turns**, interactive (the terminal interface of Claude Code, the folder trusted at its
  prompt) and in `claude -p`, each in a fresh copy of the project, to see which skill takes the
  request: the first is chosen before anything is read.
- **One feature conducted by Superpowers to its end**, in `claude -p` resumed turn after turn
  (`--resume`), the owner answering each question, with only the two plugins loaded.

**Which skill took the request.** In `claude -p` nobody answers, and Superpowers asks: there the
kit took nearly everything, and the interactive column is the one to read.

| Request | Interactive | `claude -p` |
|---|---|---|
| "Add the ability for a member to borrow a book copy: a loan is opened for a member and a copy, and it is refused when the member already holds three open loans." | `use-case`, 3 of 3 | `use-case`, 1 of 1 (whole session, the request adding that nobody answers) |
| "Members should be able to return a book copy they borrowed." | `use-case`, 2 of 2 | `use-case`, 2 of 2 |
| "We'd like members to be able to borrow book copies, with a cap on how many loans they can hold at once. Let's build it." | `brainstorming`, 4 of 5 | `brainstorming`, 1 of 8 |
| a plan of the next features, "Plan this work before anyone builds it." | `discover-domain` 1, `plan-slices` 1 | `plan-slices`, 1 of 1 (whole session) |
| "the same copy was lent to two members, and both loans are open. Fix it." | not run | `systematic-debugging`, 1 of 1 (whole session) |

The other plugins of the machine were loaded in the interactive runs and in most of the
`claude -p` ones; loading only the two changed nothing in `claude -p` (three runs each way).

**Four whole sessions in `claude -p`.** The two features went to `use-case`: `ddd-ts-kit worktree`,
the generators, the terms in `CONTEXT.md`, each spec failing before its code, a commit on the
branch, and the choices made alone listed for the owner (three each). The plan went to
`plan-slices`: `docs/architecture/slices.md`, two stories with their decisions D1 to D9, checked
by `ddd-ts-kit plan-waves`, nothing committed; it also found a gap the first feature left (a copy
could be lent twice), which became the bug report. The bug report went to
`systematic-debugging`, then `ddd-ts-kit worktree`, a handler spec that reproduced the bug,
`generate error`, the fix and `npm run verify`.

**A feature conducted by Superpowers.** The idea request, answered by the owner:

1. `brainstorming` read the project, restated the request and asked why the cap; then, told the
   reason and that returns belong to it, offered three ways (a `Borrower` aggregate holding its
   open loans, recommended; one `Loan` per borrowing; two aggregates kept in step by events) and
   asked which.
2. Given the first, it opened `ddd-ts-kit worktree borrowing`, wrote a design doc under
   `docs/superpowers/specs/` and, through `writing-plans`, a plan of three tasks under
   `docs/superpowers/plans/`, committed both, and asked how to run it. The plan carried the rules
   of the kit as its own: every file from `ddd-ts-kit generate`, only the `TODO(domain)` filled,
   no `vi.mock`, `ddd-ts-kit check --changed-since main` at the end of each task.
3. Told to run it, `executing-plans` and `test-driven-development` built it with the generators of
   the kit, mapped its refusals to 409 in `platform-error-mapper.ts`, had the branch reviewed by a
   subagent with the reviewer prompt of Superpowers, committed three times, and
   asked whether to merge, push or keep the branch, the three options of
   `finishing-a-development-branch`.

The code passed every check of the kit (60 unit and integration specs, 12 end-to-end, `check`).
What the method of the kit records was not written: no story, no `docs/architecture/slices.md`,
no `D<n>` decisions, no `quality-gate` and no `architecture-reviewer`; `ddd-ts-kit status` still
named the first step of the method.

### Who holds what

| Moment | Superpowers says | The kit says | Who held it |
|---|---|---|---|
| a feature | `brainstorming` first: the why, approaches the human picks, a design doc, then `writing-plans` | `use-case`: one vertical slice in one context, test first | the kit for a request that says what to build; Superpowers for an idea, in most interactive sessions |
| a plan | `writing-plans`: `docs/superpowers/plans/<date>-<feature>.md`, step by step with commands | `plan-slices`: `docs/architecture/slices.md`, stories with their `D<n>` decisions, checked by `plan-waves` | the kit when a plan is asked; `writing-plans` when `brainstorming` led to it |
| a test | written first and seen failing; a mock only for a dependency that is slow or external, never an assertion on a mock | written first; fakes of the ports and builders, no `vi.mock`, `vi.fn` or `vi.spyOn` (`test/no-mocks`) | both say the same; no mock in any session, the specs failed before the code |
| a bug | `systematic-debugging`: the cause first, reproduced by a test | no skill of its own | Superpowers for the diagnosis, then the generators and the guard of the kit |
| the review | `requesting-code-review`: a subagent with its reviewer prompt | `quality-gate`, the agent `architecture-reviewer` | whoever conducted the feature |
| isolation | `using-git-worktrees`: `.worktrees/` at the root | `ddd-ts-kit worktree <name>` under `.worktrees/`; the guard refuses code on the trunk | `ddd-ts-kit worktree` in every session that wrote code, the one Superpowers conducted included |
| session start | its hook injects `using-superpowers` | its hook injects the order of work of the kit | both, side by side |

The permission refusals of the whole sessions came from the kit alone, all three on the same
command: its `.claude/settings.json` asks before `generate --force`, and nobody answers in
`claude -p`; the agent deleted the generated file, which nobody had changed, and generated it
again. `using-git-worktrees` never ran.

### Who conducts: a section of AGENTS.md

When Superpowers conducts, the code is the kit's and the record of the method is not. To keep the
kit conducting features, add a section to the `AGENTS.md` of the project (the `CLAUDE.md` that
`init` writes imports it); Superpowers puts the instructions of the project above its skills:

```md
## With Superpowers

Inside this project a feature starts with the skill `ddd-ts-kit:use-case`, even when it is asked
as an idea, and a plan with `ddd-ts-kit:plan-slices`; the review before a merge is
`ddd-ts-kit:quality-gate`. Superpowers holds debugging. Its `brainstorming` runs only when
someone asks for it by name; its design doc is then the statement of needs of the story.
```

With it, the idea request still opened `brainstorming` in all six interactive sessions (its hook
asks for a skill before anything is read), but in each of the three followed past that first call the agent then read `AGENTS.md` and
moved to `ddd-ts-kit:use-case` (one of them reached its first question within the time watched).
Without it, in the two sessions followed the same way, `brainstorming` kept the turn and asked
why. A team that prefers
Superpowers to conduct can leave the section out and keep its design doc and plan beside the
stories of the kit; the kit then checks the code, not the method.

### What clashed, in short

| What | Where | Status |
|---|---|---|
| a refusal answers 422, and an agent found no way to answer 404 for a loan that does not exist | the kit | [#870](https://github.com/ddd-ts-kit/ddd-ts-kit/issues/870): `platform-error-mapper.ts` maps a code to a status, and no skill says so; the session Superpowers conducted found the file |
| two places for a plan, two reviewers | both | the section of `AGENTS.md` above |
