import { namedScripts } from '../migrations/named-scripts';
import type { OrmMember } from '../orm-member';

export const knex: OrmMember = {
  migrationTool: namedScripts,
};
