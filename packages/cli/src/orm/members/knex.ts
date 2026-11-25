import { renamedAfterTrunk } from '../../merge/renamed-after-trunk';
import { namedScripts } from '../migrations/named-scripts';
import type { OrmMember } from '../orm-member';

export const knex: OrmMember = {
  migrations: renamedAfterTrunk(namedScripts),
};
