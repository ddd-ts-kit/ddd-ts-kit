import type { ImportRecord } from './import-record';
import { statementsOf } from './statements-of';
import type { StringRecord } from './string-record';

/** The import and export statements of a blanked source: one record per string literal that is a module specifier. */
export function findImports(
  code: string,
  strings: readonly StringRecord[],
  lineAt: (offset: number) => number,
): ImportRecord[] {
  return statementsOf(code, strings).map(({ record, literal, offset }) => ({
    ...record,
    specifier: literal.value,
    line: lineAt(offset),
  }));
}
