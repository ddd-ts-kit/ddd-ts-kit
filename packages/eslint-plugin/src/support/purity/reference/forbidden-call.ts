import type { PurityTable } from './purity-table';

/** How a finding names the call of a global when the table forbids it: `fetch()`. */
export function forbiddenCall(table: PurityTable, callee: string): string | undefined {
  return table.calls.includes(callee) ? `${callee}()` : undefined;
}
