import { describe, expect, it } from 'vitest';
import { defineKind } from '../src/generate/define-kind';
import { KINDS } from '../src/generate/kinds';
import type { Reading, Scope } from '../src/generate/scope';

/** A helper that reads `--grant`, as the access of a use case does. */
function grantOf(scope: Scope<Reading<'grant'>>): string | undefined {
  return scope.flags.text('grant');
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
});

describe('the flags a kind reads', () => {
  // What the compiler holds a kind to: `npm run typecheck:tests` fails when a line marked below compiles.
  it('are the flags it declares and those every kind takes, a helper reading those it names', () => {
    const granting = defineKind({
      name: 'granting',
      summary: 'Reads the flags it declares.',
      scope: 'context',
      positionals: [],
      options: { grant: { type: 'string' }, code: { type: 'string' } },
      writesInModules: false,
      run: (scope) => {
        grantOf(scope);
        scope.flags.text('code');
        scope.flags.flag('allow-name');
        // @ts-expect-error -- the kind does not declare --permission
        scope.flags.text('permission');
      },
    });

    const coded = defineKind({
      name: 'coded',
      summary: 'Declares --code alone.',
      scope: 'context',
      positionals: [],
      options: { code: { type: 'string' } },
      writesInModules: false,
      run: (scope) => {
        // @ts-expect-error -- a helper that reads --grant is not handed the flags of a kind that does not declare it
        grantOf(scope);
      },
    });

    expect([granting.name, coded.name]).toEqual(['granting', 'coded']);
  });
});
