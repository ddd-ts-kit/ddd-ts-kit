import type { Migration, MigrationFolder } from '../../check/migrations/migration-folder';
import type { MigrationOrderFinding } from '../../merge/order/migration-order-finding';
import type { TrunkToFollow } from '../../merge/order/trunk-to-follow';
import type { MigrationsLanded } from './migrations-landed';

/** The merge whose conflicts are settled, as the landing of its migrations is decided on it. */
interface MergedHistory {
  readonly root: string;
  readonly base: string;
  readonly ours: string;
  readonly trunk: string;
  /** Whether the branch lands: its working migrations take their real names. */
  readonly toLand: boolean;
  readonly now: Date;
}

/** A branch that already holds the trunk, and the migrations it has to land after the trunk's. */
export interface FollowingHistory {
  readonly root: string;
  /** The commit of the trunk the branch already holds. */
  readonly trunk: string;
  /** The migrations to land, by name: the working ones and those that do not follow the trunk's. */
  readonly toLand: readonly string[];
  readonly now: Date;
  /** Says what would move, and moves nothing. */
  readonly dryRun: boolean;
}

/**
 * The migrations of an ORM the kit generates, and how they follow those of a trunk: renamed
 * after its last where the tool orders files (knex, Prisma, TypeORM), generated again where it
 * orders by a journal (drizzle-kit).
 */
export interface MigrationHistory {
  /** Where the tool writes its migrations, and those the folder holds, by name. */
  folder(root: string): MigrationFolder;
  /** The migrations of the working tree a commit of the trunk does not hold. */
  addedSince(root: string, trunk: string): Migration[];
  /** The migrations of the working tree that do not follow the trunk's, each with what brings the order right. */
  outOfOrder(root: string, trunk: TrunkToFollow): MigrationOrderFinding[];
  /** Lands the migrations of the branch once the conflicts of a merge are settled. */
  landInMerge(merge: MergedHistory): MigrationsLanded;
  /** Lands them on a branch that already holds the trunk: there is no merge to make. */
  landAfterTrunk(landing: FollowingHistory): MigrationsLanded;
}
