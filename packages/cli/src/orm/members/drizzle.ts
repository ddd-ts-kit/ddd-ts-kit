import { replayedAfterTrunk } from '../../merge/replayed-after-trunk';
import type { OrmMember } from '../orm-member';

export const drizzle: OrmMember = {
  migrations: replayedAfterTrunk,
};
