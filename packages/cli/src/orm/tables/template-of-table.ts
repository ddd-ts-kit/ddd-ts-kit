import { templateExists } from '../../templating';
import type { DeclaredTable } from './declared-table';

/** The template of the kind that declares the table, or the one a repository starts the same file with. */
export function templateOfTable({ templates }: DeclaredTable, file: string): string {
  const own = `${templates}/${file}`;

  return templateExists(own) ? own : `repository/${file}`;
}
