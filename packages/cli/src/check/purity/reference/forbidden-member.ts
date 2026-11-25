import type { PurityTable } from './purity-table';

/** How a finding names the member `object.property` when the table forbids it: `process.env`, any member of `console`. */
export function forbiddenMember(table: PurityTable, object: string, property: string | undefined): string | undefined {
  const members = Object.hasOwn(table.members, object) ? table.members[object] : undefined;

  if (members === undefined || property === undefined) {
    return undefined;
  }

  return members.length === 0 || members.includes(property) ? `${object}.${property}` : undefined;
}
