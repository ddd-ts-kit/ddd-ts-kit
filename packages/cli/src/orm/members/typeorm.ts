import { stampedClasses } from '../migrations/stamped-classes';
import type { OrmMember } from '../orm-member';

export const typeorm: OrmMember = {
  migrationTool: stampedClasses,
};
