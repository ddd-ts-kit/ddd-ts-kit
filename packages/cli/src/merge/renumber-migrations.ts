import fs from 'node:fs';
import path from 'node:path';
import { isWorkingMigration } from '../check/migrations/is-working-migration';
import { runGit } from '../commit/run-git';
import { mentionedTables } from './mentioned-tables';
import { nextMigrationNumber } from './next-migration-number';
import type { MigrationTool } from '../orm/migrations/migration-tool';
import type { MigrationsLanded } from '../orm/migrations/migrations-landed';
import { numberedName } from '../orm/migrations/numbered-name';
import type { OrderedMigration } from '../orm/migrations/ordered-migration';
import { appliedUnderOldName } from './order/applied-under-old-name';

/** The migrations of a project to land on the trunk, by the tool that orders them: knex, Prisma or TypeORM. */
export interface Renumbering {
  readonly root: string;
  readonly tool: MigrationTool;
  /**
   * The base of the merge and the commit of the trunk. With the trunk as the base (a branch that
   * already holds it), what the trunk gained is what comes after the first migration to land, and
   * only the migrations that do not follow the trunk's already are renamed.
   */
  readonly base: string;
  readonly trunk: string;
  readonly now: Date;
  /** Says what would be renamed, and renames nothing. */
  readonly dryRun?: boolean;
}

/** A migration of the branch and what it lands as. */
interface Move {
  readonly migration: OrderedMigration;
  readonly number: string;
  readonly target: OrderedMigration;
}

/** What the walk has just passed: the migration the next one has to follow. */
interface Passed {
  readonly key: string;
  readonly name: string;
  readonly number: string;
}

interface Walk {
  readonly start: Passed;
  readonly now: Date;
  readonly isMoving: (migration: OrderedMigration, previous: Passed) => boolean;
}

const EPOCH = new Date(0);

/**
 * Lands the migrations of the branch the trunk does not have: each gets a number after the last
 * of the trunk and loses its `working-` prefix, its content kept (TypeORM: the class and its
 * `name` follow). On a branch that already holds the trunk, a migration that follows the last of
 * the trunk already keeps its name, and the others keep their order around it. A number is never
 * one a file of the folder carries already. When a migration the trunk gained since the base
 * changes a table one of the renamed changes too, their order is a decision: the landing stops,
 * the migration is to generate again on the trunk.
 */
export function renumberMigrations(renumbering: Renumbering): MigrationsLanded {
  const { root, tool, trunk } = renumbering;
  const onTrunk = tool.inCommit(root, trunk);
  const held = new Set(onTrunk.map(({ file }) => file));
  const branch = tool.inTree(root).filter(({ file }) => !held.has(file));
  const moves = movesOf(renumbering, { branch, onTrunk });

  if (typeof moves === 'string') {
    return { lines: [], stop: moves };
  }

  const overlap = overlapOf(renumbering, {
    moves,
    gained: gainedBy(renumbering, { onTrunk, first: moves[0]?.migration }),
  });

  if (overlap !== undefined || moves.length === 0) {
    return { lines: [], ...(overlap === undefined ? {} : { stop: overlap }) };
  }

  return { lines: [...moves.map((move) => moved(renumbering, move)), appliedUnderOldName(tool.underOldName)] };
}

/** What the trunk gained since the base; without a merge, what comes after the first migration to land. */
function gainedBy(
  { root, tool, base, trunk }: Renumbering,
  { onTrunk, first }: { onTrunk: readonly OrderedMigration[]; first: OrderedMigration | undefined },
): OrderedMigration[] {
  if (base === trunk) {
    return onTrunk.filter(({ key }) => first !== undefined && tool.comesAfter(key, first.key));
  }

  const before = new Set(tool.inCommit(root, base).map(({ file }) => file));

  return onTrunk.filter(({ file }) => !before.has(file));
}

/**
 * The migrations to rename, in their order, each with its number; or why one cannot be numbered.
 * In a merge, all of them, not before now. Without one, those that do not follow what comes
 * before them: the last of the trunk, then each migration of the branch in turn. A migration
 * that keeps its name bounds the numbers before it, so those count up from the last of the
 * trunk; with none after them they are numbered from now, as in a merge.
 */
function movesOf(
  renumbering: Renumbering,
  { branch, onTrunk }: { branch: readonly OrderedMigration[]; onTrunk: readonly OrderedMigration[] },
): Move[] | string {
  const { tool, base, trunk, now } = renumbering;
  const start = startOf(tool, onTrunk.at(-1));

  if (base !== trunk) {
    return numbered(renumbering, branch, { start, now, isMoving: () => true });
  }

  const isMoving = (migration: OrderedMigration, previous: Passed): boolean =>
    isWorkingMigration(migration.name) || !tool.comesAfter(migration.key, previous.key);

  const counted = numbered(renumbering, branch, { start, now: EPOCH, isMoving });

  if (typeof counted === 'string') {
    return counted;
  }

  const moving = new Set(counted.map((move) => move.migration));
  const firstMoved = branch.findIndex((migration) => moving.has(migration));
  const bounded = branch.some((migration, index) => index > firstMoved && !moving.has(migration));

  return bounded ? counted : numbered(renumbering, branch, { start, now, isMoving });
}

/** What the first migration of the branch has to follow: the last of the trunk; zeros, in the format of the tool, without one. */
function startOf(tool: MigrationTool, last: OrderedMigration | undefined): Passed {
  return last === undefined
    ? { key: '', name: '', number: tool.lowestNumber }
    : { key: last.key, name: last.name, number: tool.numberOf(last) || tool.lowestNumber };
}

/** Walks the migrations in their order: one that moves takes the next free number after the one before it. */
function numbered(
  { root, tool }: Renumbering,
  branch: readonly OrderedMigration[],
  { start, now, isMoving }: Walk,
): Move[] | string {
  const moves: Move[] = [];
  const taken = new Set(branch.map(({ key }) => key));
  let previous = start;

  for (const migration of branch) {
    if (!isMoving(migration, previous)) {
      previous = { key: migration.key, name: migration.name, number: tool.numberOf(migration) || previous.number };

      continue;
    }

    const move = freeMove({ root, tool, taken }, migration, nextMigrationNumber(previous.number, now));

    if (!tool.comesAfter(move.target.key, previous.key)) {
      return `${migration.name} cannot be given a number that sorts after "${previous.name}", which carries none a migration can follow: rename or move "${previous.name}" by hand (knex loads every script of its folder as a migration), then run the same command again.`;
    }

    taken.add(move.target.key);
    moves.push(move);
    previous = { key: move.target.key, name: move.target.name, number: move.number };
  }

  return moves;
}

/** The move of a migration to `number`, or to the next number no file of the folder and no move of this run carries. */
function freeMove(
  { root, tool, taken }: { root: string; tool: MigrationTool; taken: ReadonlySet<string> },
  migration: OrderedMigration,
  number: string,
): Move {
  const target = tool.numbered(migration, number);
  const occupied = target.file !== migration.file && fs.existsSync(path.join(root, placeOf(target.file)));

  return occupied || taken.has(target.key)
    ? freeMove({ root, tool, taken }, migration, nextMigrationNumber(number, EPOCH))
    : { migration, number, target };
}

/** What is renamed on disk: the file of a migration, or its folder under Prisma. */
function placeOf(file: string): string {
  return path.posix.basename(file) === 'migration.sql' ? path.posix.dirname(file) : file;
}

function moved({ root, tool, dryRun }: Renumbering, { migration, number, target }: Move): string {
  if (dryRun === true) {
    return `${migration.name} would be renamed with a number after the last migration of the trunk`;
  }

  if (target.file !== migration.file) {
    fs.renameSync(path.join(root, placeOf(migration.file)), path.join(root, placeOf(target.file)));
  }

  tool.stamp?.(path.join(root, target.file), number);

  return target.name === migration.name
    ? `${migration.name} given the stamp ${number} in its class, after the last migration of the trunk`
    : `${migration.name} renamed ${target.name}, after the last migration of the trunk`;
}

function overlapOf(
  { root, tool, trunk }: Renumbering,
  { moves, gained }: { moves: readonly Move[]; gained: readonly OrderedMigration[] },
): string | undefined {
  // `./`: from the project root, which is not the top of the repository when the project sits in a folder of it.
  const theirs = new Set(
    gained.flatMap((migration) => [...mentionedTables(runGit(root, ['show', `${trunk}:./${migration.file}`]) ?? '')]),
  );

  for (const { migration } of moves) {
    const shared = [...mentionedTables(fs.readFileSync(path.join(root, migration.file), 'utf8'))].filter((table) =>
      theirs.has(table),
    );

    if (shared.length > 0) {
      return `${migration.name} changes ${shared.join(', ')}, which a migration the trunk gained since the base changes too (${gained.map((other) => other.name).join(', ')}): their order is a decision. ${generateAgain(tool, migration)}`;
    }
  }

  return undefined;
}

/**
 * How the migration is generated again after the trunk's: its name is taken until the old one is
 * deleted, which `db:generate` refuses, so the deletion comes first.
 */
function generateAgain(tool: MigrationTool, migration: OrderedMigration): string {
  const rest = numberedName(migration.name)?.rest ?? migration.name;
  const what = rest.replace(/^[_.-](?:working[_-])?/, '');
  const place = placeOf(migration.file);
  const old = place === migration.file ? place : `the folder ${place}/`;

  return `Generate it again on the trunk: delete ${old} (\`git show HEAD:./${migration.file}\` keeps what was written by hand), then \`npm run db:generate ${tool.generatedAs(what)}\`, which refuses the name while the old migration is there.`;
}
