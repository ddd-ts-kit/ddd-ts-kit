import type { Config } from '../config';
import { contextVars } from '../generate/context-vars';
import { parseContextName } from '../naming';
import { ORM_MEMBERS } from '../orm/orm-members';
import type { Workspace } from '../workspace';

/**
 * The tables of a context stay known to the migration tooling: a context whose tables file the
 * schema index does not name (a project whose earlier `--force` emptied the index, a region the
 * template no longer holds) joins it again, and the database schema of its models the datasource
 * on Prisma. What the index names already is left as it is, however it is written.
 */
export function rewireTables(ws: Workspace, config: Config, name: string): void {
  const context = parseContextName(name);

  ORM_MEMBERS[config.stack.orm].tables?.relist({ ws, config, context, vars: contextVars(config, context) });
}
