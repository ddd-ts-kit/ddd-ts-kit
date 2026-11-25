import type { ImportStatement } from './import-statement';

/** The names a statement binds in its file: the last word of each binding. */
export function boundBy({ whole, named }: Pick<ImportStatement, 'whole' | 'named'>): string[] {
  return [...whole, ...named].map((binding) => binding.split(/\s+/).at(-1) ?? '');
}
