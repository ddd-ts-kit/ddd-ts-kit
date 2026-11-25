import type { PurityTable } from './purity-table';

/** How a finding names an export imported by name when the table forbids it: `randomBytes of "node:crypto"`. */
export function forbiddenNamedImport(table: PurityTable, source: string, name: string): string | undefined {
  return table.namedImports[source.replace(/^node:/, '')]?.includes(name) === true
    ? `${name} of "${source}"`
    : undefined;
}
