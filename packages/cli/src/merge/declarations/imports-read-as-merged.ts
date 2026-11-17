import { oneLineImports } from '../../markers/one-line-imports';
import type { DeclaredSides } from './merge-declarations';
import { mergedImports } from './merged-imports';

/** The names an import statement written on one line brings from a module. */
const NAMED = /^import (type )?\{ ([^}]+) \} from '([^']+)';$/;

/**
 * Whether the `imports` region the union of lines gives brings what the three sides merged
 * statement by statement bring: the same names from the same modules, whatever the statements
 * they are written in and their order. False when a statement of a side is no import the kit
 * merges by statement: the region is then read as any other declarations.
 */
export function importsReadAsMerged(union: readonly string[], sides: DeclaredSides): boolean {
  const merged = mergedImports(sides);
  const brought = broughtBy(union.filter((line) => line.trim() !== ''));

  return merged !== undefined && [...broughtBy(merged)].sort().join('\n') === [...brought].sort().join('\n');
}

/** What import statements bring: each name with its module, or the statement when it names none that way. */
function broughtBy(lines: readonly string[]): Set<string> {
  return new Set(
    oneLineImports(lines).flatMap((statement) => {
      const [, type = '', names, source = ''] = NAMED.exec(statement) ?? [];

      return names === undefined ? [statement] : names.split(',').map((name) => `${type}${source} ${name.trim()}`);
    }),
  );
}
