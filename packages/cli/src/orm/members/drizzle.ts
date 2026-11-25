import type { OrmMember } from '../orm-member';

/** drizzle-kit orders its migrations by its journal: they are generated again, never renamed. */
export const drizzle: OrmMember = {};
