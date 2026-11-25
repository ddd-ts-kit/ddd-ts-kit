import type { PurityTwinCase } from './purity-twin-cases';

export interface PurityTwinDifference extends Omit<PurityTwinCase, 'found'> {
  readonly checker: readonly string[];
  readonly eslint: readonly string[];
}

const CLOCK = 'purity/no-system-clock';
const RANDOMNESS = 'purity/no-ambient-randomness';
const ENVIRONMENT = 'purity/no-environment';

/**
 * Where the two analyzers still answer differently, each kept as a row so that the day one of
 * them changes its answer is seen: the checker reads the text, without the scopes and the syntax
 * tree the plugin has. The plugin is the authority.
 */
export const PURITY_TWIN_DIFFERENCES: readonly PurityTwinDifference[] = [
  {
    what: 'an alias of the global, which only the plugin follows',
    layer: 'domain',
    source: ['const clock = Date;', 'const started = clock.now();'],
    checker: [],
    eslint: [`${CLOCK}:2`],
  },
  {
    what: 'an import under another name, which only the plugin follows to its calls',
    layer: 'application',
    source: ["import { randomUUID as id } from 'node:crypto';", 'const next = id();'],
    checker: [`${RANDOMNESS}:1`],
    eslint: [`${RANDOMNESS}:1`, `${RANDOMNESS}:2`],
  },
  {
    what: 'a signature with neither body, return type nor modifier, which the checker reads as a call',
    layer: 'domain',
    source: ['export interface Source {', '  fetch(id: string);', '}'],
    checker: [`${ENVIRONMENT}:2`],
    eslint: [],
  },
  {
    what: 'a signature after a member that no semicolon ends, which the checker reads as a call',
    layer: 'domain',
    source: ['export interface Source {', '  name(): string', '  fetch(id: string): string', '}'],
    checker: [`${ENVIRONMENT}:3`],
    eslint: [],
  },
  {
    what: 'a name declared in the head of a loop without braces, which the checker hides in the head only',
    layer: 'domain',
    source: [
      'export function run(all: { env: string }[]): void {',
      '  for (const process of all) use(process.env);',
      '}',
    ],
    checker: [`${ENVIRONMENT}:2`],
    eslint: [],
  },
  {
    what: 'a var declared in a nested block, which the checker hides in that block only',
    layer: 'domain',
    source: [
      'export function run(given: boolean): unknown {',
      '  if (given) {',
      '    var process = { env: 1 };',
      '  }',
      '  return process.env;',
      '}',
    ],
    checker: [`${ENVIRONMENT}:5`],
    eslint: [],
  },
  {
    what: 'a type that names a member of the global, which the checker reads as a use',
    layer: 'domain',
    source: ['export type Environment = typeof process.env;'],
    checker: [`${ENVIRONMENT}:1`],
    eslint: [],
  },
];
