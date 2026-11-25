import type { Config } from '../config';
import type { DatabaseAccess } from '../orm/database-access';
import { ORM_MEMBERS } from '../orm/orm-members';
import type { RenderContext } from '../templating';

/** How the composition roots open the storage of the stack, and what the storage offers them. */
export function persistenceVars(config: Config): RenderContext {
  const { orm, events } = config.stack;
  const { database } = ORM_MEMBERS[orm];
  const hasDatabase = database !== undefined;

  return {
    needsUrl: hasDatabase,
    hasDatabase,
    ...tokenVars(database),
    await: database?.opensWithPromise === true ? 'await ' : '',
    signals: !hasDatabase && events === 'outbox',
  };
}

/** What a repository adapter names to reach the storage: a class of the platform, or the context class of the ORM package. */
function tokenVars(database: DatabaseAccess | undefined): RenderContext {
  const token = database?.token ?? '';
  const from = database?.tokenPackage ?? '';

  return {
    ownDatabase: token !== '' && from === '',
    packagedToken: from !== '',
    token,
    tokenOrNone: token === '' ? 'Database' : token,
    tokenPackage: from,
  };
}
