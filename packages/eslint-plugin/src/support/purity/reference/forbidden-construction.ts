import type { PurityTable } from './purity-table';

/** How a finding names `new callee` when the table forbids it: always, or only when nothing is given to the constructor. */
export function forbiddenConstruction(table: PurityTable, callee: string, hasArguments: boolean): string | undefined {
  if (table.constructions.includes(callee)) {
    return `new ${callee}`;
  }

  return table.bareConstructions.includes(callee) && !hasArguments ? `new ${callee}() without argument` : undefined;
}
