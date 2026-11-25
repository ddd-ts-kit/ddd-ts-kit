import type { Config } from '../../../config';
import { ORM_MEMBERS } from '../../../orm/orm-members';
import { emptyPicture } from '../../../orm/tables/empty-picture';
import type { IndexPicture } from '../../../orm/tables/index-picture';
import type { Workspace } from '../../../workspace';

/**
 * The picture of the schema index a workspace holds. On Drizzle, what each name exports as a
 * value, read as the compiler resolves it. On TypeORM, the entities its `entities` lists, each by
 * the file it is imported from, resolved, and its name there: the names of the imports are local
 * to the index. On another ORM, nothing.
 */
export function indexPicture(ws: Workspace, config: Config): IndexPicture {
  const index = `${config.platformDir}/database/schema.ts`;
  const text = ws.read(index);
  const names = ORM_MEMBERS[config.stack.orm].tables?.indexNames;

  return text === undefined || names === undefined ? emptyPicture(text) : names.picture(ws, config, { index, text });
}
