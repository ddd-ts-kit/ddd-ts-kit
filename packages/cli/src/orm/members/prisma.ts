import { namedFolders } from '../migrations/named-folders';
import type { OrmMember } from '../orm-member';

export const prisma: OrmMember = {
  migrationTool: namedFolders,
};
