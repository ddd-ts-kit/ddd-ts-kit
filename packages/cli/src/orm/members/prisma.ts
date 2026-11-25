import { renamedAfterTrunk } from '../../merge/renamed-after-trunk';
import { namedFolders } from '../migrations/named-folders';
import type { OrmMember } from '../orm-member';

export const prisma: OrmMember = {
  migrations: renamedAfterTrunk(namedFolders),
};
