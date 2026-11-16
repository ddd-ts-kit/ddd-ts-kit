import { oneLineImports } from '../../markers/one-line-imports';
import { registryUnion } from '../registry-union';
import type { DeclaredSide } from './declared-side';
import type { DeclaredSides } from './merge-declarations';

/** A whole import statement on one line, without a comment. */
const ONE_IMPORT = /^import\s[^/']*(?:'[^']*')?;$/;

/**
 * The imports region merged statement by statement when each statement of the three sides reads
 * as one import: each on one line, then merged as the registry merges whole statements, the names
 * imported from one module in one statement. Undefined when a statement holds a comment or is no
 * import: the region is then merged as any other declarations.
 */
export function mergedImports({ ours, base, theirs }: DeclaredSides): string[] | undefined {
  const sides = [ours, base, theirs].map(statementsOf);
  const [mine, origin, other] = sides;

  if (mine === undefined || origin === undefined || other === undefined) {
    return undefined;
  }

  return registryUnion({ kind: 'conflict', ours: mine, base: origin, theirs: other, raw: [], line: 1 }, 'imports');
}

function statementsOf(side: DeclaredSide): string[] | undefined {
  const statements = side.declarations.map(({ lines }) => oneLineImports(lines));

  return statements.every((lines) => lines.length === 1 && ONE_IMPORT.test(lines[0] ?? ''))
    ? statements.flat()
    : undefined;
}
