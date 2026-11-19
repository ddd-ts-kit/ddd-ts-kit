**English** · [Français](versioning.fr.md)

# Versions and stability

**Summary.** The kit is in its 0.x versions: its API and the layout of a generated project still
move. A patch version never breaks anything; a minor version may, and then each break says what to
do in a `To move:` line of [CHANGELOG.md](../CHANGELOG.md). The ranges `init` writes take patches
alone, so a break never reaches a project without someone changing a version. Version 1.0 will
freeze the API and add a deprecation period to every removal.

## One version for everything

The CLI (`ddd-ts-kit`), every `@ddd-ts-kit/*` package and the plugin for coding agents are released
together, under one version. A project upgrades them together: a package of the kit expects the
others at the same version, and the plugin describes the commands of the CLI it was released with.
The kit is released often, several times a week at times: each release is small, and its notes in
CHANGELOG.md are short.

## What a version number says, before 1.0

| The version moves | Example | What it may hold |
|---|---|---|
| patch | 0.113.1 to 0.113.2 | fixes and additions, never a break: nothing a project wrote or generated stops working |
| minor | 0.113.2 to 0.114.0 | the same, and changes that break; each comes with its `To move:` line |

A break is any change after which a project has to act: an API renamed or removed, a rule that now
refuses what it accepted, a generated file the project must write again, a layout that moves. The
release enforces the line between the two: `pipeline/monorepo/release-version.mjs --set` refuses a
patch version while a pending change asks a project to act. It does so from version 0.114.0: three
earlier patch versions (0.83.1, 0.83.4 and 0.84.1) carried a `To move:` line.

Before 1.0 a break carries no transition: no alias, no shim, no warning first (the decision and its
reasons are in [ADR 0005](adr/0005-a-refusal-is-an-error-at-once-before-1-0.md)). What replaces
them is the `To move:` line, which says what changed and what to run, and the commands that do the
move: `ddd-ts-kit doctor` lists what an upgrade left to do, `ddd-ts-kit init --force` writes the
files `init` owns again and keeps the team's, `ddd-ts-kit check --rule <id>` lists the files a rule
now refuses.

## The ranges a project holds

`init` writes the packages of the kit at a caret range of the version that ran it, `^0.113.2`. For a
version below 1.0, npm and pnpm read that range as "0.113.2 or a later patch of 0.113": the
installs of a project, its CI and a teammate's machine take fixes on their own, and a minor version,
the only kind that may break, comes only when someone changes the range. Keep the lockfile in the
repository: it fixes the exact version every install takes between two upgrades.

## Upgrading

1. Read the sections of [CHANGELOG.md](../CHANGELOG.md) from the version after yours to the new
   one. It is also shipped as `node_modules/ddd-ts-kit/CHANGELOG.md`, where a coding agent reads it.
   Each `To move:` line is a step.
2. Change every `ddd-ts-kit` and `@ddd-ts-kit/*` version together, install, and update the plugin.
3. Run the commands the `To move:` lines name, then `npx ddd-ts-kit doctor` and `npm run verify`.

Several minor versions can be crossed at once: the steps add up, in the order of the changelog. The
guide [Migrate after a kit upgrade](guides/commands.md#migrate-after-a-kit-upgrade) details each
command.

## What is supported

- **Versions.** The latest version receives the fixes, security fixes included; an older version is
  not patched ([SECURITY.md](../SECURITY.md)). Before 1.0 the cost of staying current is the
  `To move:` lines, which is why each one says what to run.
- **Node.** 22.12 or later. Every pull request runs the specs on Node 22 and Node 24.
- **Package managers.** npm and pnpm: the pipeline installs generated projects with both.
- **TypeScript.** The generated projects type-check with the native TypeScript 7 compiler.

## What 1.0 will guarantee

The policy of 1.0 replaces ADR 0005, as that record says:

- A break comes only in a major version. Minor and patch versions keep every published form working.
- What goes away is deprecated first: it keeps working, a warning names its replacement, and it is
  removed no earlier than the next major version.
- A new rule that refuses what a project already holds starts as a warning in a minor version and
  becomes an error in the next major one.
- The previous major version keeps receiving security fixes for a period stated when the next one
  is released.

## The road to 1.0

1.0 has no date. It comes when the kit no longer needs to break to hold what it promises:

- the layout of a generated project and the public API of each package went through several minor
  versions without a `To move:` line;
- the example applications and the trial projects upgrade from one version to the next with the
  `To move:` lines alone, and an upgrade asks for no hand-written change beyond them;
- each family (ORM, brokers, loggers) is at parity, or what it lacks is declared;
- no issue of severity high is open.

Until then, a project that needs a frozen API holds its version and upgrades when it chooses: the
changelog keeps every step.
