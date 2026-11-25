import { renamedAfterTrunk } from '../../merge/renamed-after-trunk';
import { stampedClasses } from '../migrations/stamped-classes';
import type { OrmMember } from '../orm-member';

export const typeorm: OrmMember = {
  migrations: renamedAfterTrunk(stampedClasses),
};
