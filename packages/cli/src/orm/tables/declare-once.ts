import { CliError } from '../../cli-error';
import { applyWiring } from '../../generate/apply-wiring';
import type { Scope } from '../../generate/scope';
import type { DeclaredTable } from './declared-table';

/**
 * A command run again with the same options adds nothing, its block being there already. Run again with others
 * (`--personal`, `--tenant-scoped`, `--field`), it would declare the table a second time under the same name, and
 * every spec that loads the file would fail on the name declared twice: it is refused, the file left as it was.
 * A table is counted where it is declared (`.table(`, `createTable(`, `tableName:`, `@@map(`): a column may bear
 * the name of another table.
 */
export function declareOnce(
  scope: Scope,
  { file, declared }: { file: string; declared: DeclaredTable },
  wiring: string,
): void {
  const named = new RegExp(
    `(?:\\btable\\(\\s*|\\bcreateTable\\(|\\btableName: |@@map\\()['"]${declared.table}['"]`,
    'g',
  );

  const count = (): number => scope.ws.read(file)?.match(named)?.length ?? 0;
  const before = count();

  applyWiring(scope.ws, file, wiring);

  if (before > 0 && count() > before) {
    throw new CliError(
      `${file} already declares the table ${declared.table}, with other columns than this command would write.`,
      declared.changedBy
        .replace('<file>', file)
        .replace('<context>', scope.context.kebab)
        .replace('<table>', declared.table),
    );
  }
}
