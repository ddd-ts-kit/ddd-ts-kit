import { renamedAfterTrunk } from '../../merge/renamed-after-trunk';
import { namedFolders } from '../migrations/named-folders';
import type { OrmMember } from '../orm-member';
import { prismaModels } from '../tables/prisma-models';

export const prisma: OrmMember = {
  database: { token: 'Database', opensWithPromise: true },
  migrations: renamedAfterTrunk(namedFolders),
  tables: prismaModels,
};
