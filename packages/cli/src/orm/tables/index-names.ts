import type { Config } from '../../config';
import type { Scope } from '../../generate/scope';
import type { Workspace } from '../../workspace';
import type { DeclaredTable } from './declared-table';
import type { IndexPicture } from './index-picture';

/** A name the index gave before a command and gives no more: the table it named, and the module the index took it from. */
export interface LostName {
  readonly name: string;
  readonly was: string;
  readonly from: string;
}

/** A table a generator has just listed in the index. */
interface ListedTable {
  readonly declared: DeclaredTable;
  /** The names the command brings to the context: the constant, unless its tables file held it already. */
  readonly brought: readonly string[];
  /** The name the index gives the table. */
  readonly local: string;
  /** The lines the generator wrote in the index. */
  readonly wiring: string;
}

/** The schema index a rewrite is about to replace: the part a team wrote outside the regions of the kit, and what replaces the whole. */
interface RewrittenIndex {
  readonly index: string;
  readonly outside: string;
  readonly rewritten: string;
}

/**
 * The names the schema index of an ORM gives its tables, where two contexts can give one name to
 * two tables: the names the index exports (Drizzle), the entities it lists (TypeORM). What a
 * command reads of them, what it settles, and how it says what it would lose.
 */
export interface IndexNames {
  /** What the index gives the migration tooling, read as the ORM reads it. */
  picture(ws: Workspace, config: Config, held: { readonly index: string; readonly text: string }): IndexPicture;
  /** What the index gave before a command and gives no more after it. */
  lost(before: IndexPicture, after: IndexPicture): LostName[];
  /** Each loss, as the note of the command says it. */
  lossesSaid(losses: readonly LostName[]): string[];
  /** What a table written out of its tables file costs the index, said after what restores it; nothing when the index still compiles. */
  readonly withoutItsTable: string;
  /** What `init --force` is told to move inside the regions of the kit, for the names it would lose. */
  toMoveInside(names: number): string;
  /** What the index says of the name it gives a table a generator has just listed. */
  listedAs(scope: Scope, listed: ListedTable): string[];
  /** Tells apart the tables two contexts give one name, once every context is listed: what it did, or what is left to write by hand. */
  settled(ws: Workspace, config: Config): string[];
  /** What a team wrote outside the regions of the kit that the kit does not read with certainty. */
  unreadOutside(ws: Workspace, config: Config, index: RewrittenIndex): string[];
}
