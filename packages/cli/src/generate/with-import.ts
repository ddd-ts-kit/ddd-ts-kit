import { ImportStatements } from '../source-text';

/** The source with an import statement after its last import, unless it already binds what the statement imports. */
export function withImport(source: string, statement: string): string {
  return ImportStatements.of(source).with(statement);
}
