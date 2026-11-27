import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMON_FLAGS } from '../src/generate/generate-options';
import { KINDS } from '../src/generate/kinds';
import { REPO_ROOT } from './helpers';

const SOURCES = path.join(REPO_ROOT, 'packages/cli/src');
const KINDS_DIRECTORY = path.join(SOURCES, 'generate/kinds');
const DEFINE_KIND = path.join(SOURCES, 'generate/define-kind.ts');

/**
 * Flags the sources a kind runs read, and that its command line still refuses, with the reason.
 * A new line here is a decision about the kind, not a way to turn the spec green.
 */
const READ_WITH_FLAGS_OF_ITS_OWN: Readonly<Record<string, { readonly flags: readonly string[]; why: string }>> = {
  context: {
    flags: ['version', 'tenant-scoped', 'personal', 'subject', 'erasure', 'retention'],
    why: '--preset runs the kinds of the preset with the flags the preset gives them',
  },
  command: {
    flags: ['tenant-scoped', 'personal', 'subject', 'erasure', 'retention'],
    why: 'the repository a command writes on its first use takes the defaults; generate repository takes these flags',
  },
  'file-upload': {
    flags: ['command', 'query', 'mapper', 'serializer', 'cache'],
    why: 'an upload sets --command itself and has no request mapper, serializer or cache policy of its own',
  },
  policy: {
    flags: ['grant', 'public'],
    why: 'the use cases a policy writes again keep the access they were generated with',
  },
};

function resolved(from: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(from), specifier);

  return [`${base}.ts`, `${base}/index.ts`].find((candidate) => fs.existsSync(candidate));
}

/** A source and every source it imports a value from, relative imports followed to the end. */
function closureOf(file: string, seen = new Set<string>()): Set<string> {
  seen.add(file);

  const imported = [...fs.readFileSync(file, 'utf8').matchAll(/^import (?!type )[^;]*? from '(\.[^']*)';/gm)];

  for (const next of imported.flatMap((match) => resolved(file, match[1] ?? '') ?? [])) {
    if (!seen.has(next)) {
      closureOf(next, seen);
    }
  }

  return seen;
}

/** The flags a source reads: `flags.text('permission')`, `scope.flags.flag('public')`. */
function flagsReadBy(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');

  return [...source.matchAll(/flags\.(?:text|flag|many)\('([a-z-]+)'\)/g)].map((match) => match[1] ?? '');
}

function sourceOf(kind: string): string {
  const declaration = `export const ${kind.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}Kind`;

  const file = fs
    .readdirSync(KINDS_DIRECTORY)
    .map((name) => path.join(KINDS_DIRECTORY, name))
    .find((candidate) => candidate.endsWith('.ts') && fs.readFileSync(candidate, 'utf8').includes(declaration));

  if (file === undefined) {
    throw new Error(`No source declares ${declaration}.`);
  }

  return file;
}

/** The flags the sources of a kind read that neither its declarations, the common flags nor a decision above account for. */
function unshown(kind: (typeof KINDS)[number]): string[] {
  // `--module` is taken by the kinds that write into a module; the others refuse it, saying why.
  const shown = new Set([
    ...COMMON_FLAGS,
    'module',
    ...Object.keys(kind.options),
    ...(READ_WITH_FLAGS_OF_ITS_OWN[kind.name]?.flags ?? []),
  ]);

  // The steps `defineKind` takes for every kind read `--module` and `--term` of the kinds that declare them alone.
  const read = [...closureOf(sourceOf(kind.name), new Set([DEFINE_KIND]))]
    .filter((file) => file !== DEFINE_KIND)
    .flatMap(flagsReadBy);

  return [...new Set(read)].filter((flag) => !shown.has(flag));
}

describe('the usage of each kind of generate', () => {
  it.each(KINDS.flatMap((kind) => (kind.shownOptions === undefined ? [] : [[kind.name, kind] as const])))(
    'writes by hand the flags %s declares, and those alone',
    (_name, kind) => {
      const written = [...new Set([...(kind.shownOptions ?? '').matchAll(/--([a-z-]+)/g)].map((match) => match[1]))];

      expect(written).toEqual(Object.keys(kind.options));

      for (const [flag, option] of Object.entries(kind.options)) {
        const value = option.type === 'string' ? ` ${option.value ?? `<${flag}>`}` : '';

        expect(kind.shownOptions).toContain(`--${flag}${value}`);
      }
    },
  );

  it.each(KINDS.map((kind) => [kind.name, kind] as const))(
    'declares every flag the sources of %s read, the flags every kind takes aside',
    (_name, kind) => {
      expect(unshown(kind)).toEqual([]);
    },
  );

  it('reads, in the sources of a kind, the flags a helper it calls reads', () => {
    expect(flagsReadBy(path.join(SOURCES, 'generate/access-vars.ts'))).toEqual(
      expect.arrayContaining(['permission', 'public']),
    );

    expect([...closureOf(sourceOf('command'))]).toContain(path.join(SOURCES, 'generate/access-vars.ts'));
  });
});
