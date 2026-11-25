import type { Scan } from '../scan/scan';
import type { ForbiddenUse } from './forbidden-use';
import { forbiddenNamedImport } from './reference/forbidden-named-import';
import type { PurityTable } from './reference/purity-table';

const NAMED_IMPORT = /(?<![\w$.])import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^{}]*)\}\s*from\s*(?=['"])/g;
/** The exported name of each part of an import clause, `type` and what follows `as` left out. */
const IMPORTED = /(?:^|,)\s*(?:type\s+)?([\w$]+)/g;

/** Each export a source imports by name that the table forbids, `randomBytes` of `node:crypto`, under any local name. */
export function forbiddenNamedImports(scan: Scan, table: PurityTable): ForbiddenUse[] {
  return [...scan.code.matchAll(NAMED_IMPORT)].flatMap((statement) => {
    const source = scan.strings.find(({ start }) => start === statement.index + statement[0].length)?.value ?? '';
    const names = statement.index + statement[0].indexOf('{') + 1;

    return [...(statement[1] ?? '').matchAll(IMPORTED)].flatMap((part) => {
      const name = part[1] ?? '';
      const what = forbiddenNamedImport(table, source, name);

      return what === undefined ? [] : [{ at: names + part.index + part[0].length - name.length, what }];
    });
  });
}
