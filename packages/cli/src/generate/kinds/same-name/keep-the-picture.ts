import type { Config } from '../../../config';
import { ORM_MEMBERS } from '../../../orm/orm-members';
import { fileOfTable } from '../../../orm/tables/file-of-table';
import type { IndexNames, LostName } from '../../../orm/tables/index-names';
import type { IndexPicture } from '../../../orm/tables/index-picture';
import { workspaceSources } from './workspace-sources';
import { Workspace } from '../../../workspace';
import { contextOfSource } from './context-of-source';
import { indexPicture } from './index-picture';
import { readTablesFile } from './read-tables-file';
import type { Sources } from './sources-of';

/** What a region of the kit holds, between its markers. */
const REGION = /\/\/ ddd-ts-kit:[\w-]+\n([\s\S]*?)\/\/ \/ddd-ts-kit:[\w-]+/g;

/** The two pictures of a command, and the names of the index they are compared by. */
interface Compared {
  readonly before: IndexPicture;
  readonly after: IndexPicture;
  readonly names: IndexNames;
}

/**
 * The last word of a command on the schema index, said once, on the state the command ends in:
 * what the index gave on disk before the command is compared with what the workspace holds when
 * every generator has run. A name the index exported before and exports no more, an entry of
 * `entities` on TypeORM listed no more, or a name that exported one value and exports another: the
 * index is left as it stood on disk, reported as left, the sentences the command noted about its
 * names are taken back, and one note names every name concerned and says what to do. Nothing is done when the picture is
 * kept, nor when an earlier step of the command already left the index. While a file the index
 * re-exports is not read with certainty, before the command or after it, the index is never left:
 * each name lost and each name moved is said hedged, and the command goes on as before; a name
 * files read share is the settle's, whose note says it. Names are compared, not the tables behind
 * them: a table still exported under another name is a name lost.
 */
export function keepThePicture(ws: Workspace, config: Config, command: 'generate' | 'init'): void {
  const index = `${config.platformDir}/database/schema.ts`;
  const before = indexPicture(new Workspace(ws.root, false), config);
  const after = indexPicture(ws, config);
  const names = ORM_MEMBERS[config.stack.orm].tables?.indexNames;

  if (before.text === undefined || after.text === undefined) {
    return;
  }

  // An earlier step left the index as it stood: what a later one wrote in it goes too.
  if (ws.notes.some((note) => note.startsWith(`${index} is left as it stood`))) {
    ws.leave(index, before.text);

    return;
  }

  // An index that gives its tables no name two contexts can share has nothing to lose.
  if (names === undefined) {
    return;
  }

  const { rewritten, why, hedged } = whatChanged(ws, config, { before, after, names });

  // A table the command wrote out of its tables file is not kept by leaving the index: it is said, and the command goes
  // on. What hangs on a module not read is said hedged, when nothing certain leaves the index.
  [...rewritten, ...(why.length === 0 ? hedged : [])].forEach((sentence) => {
    ws.note(`${index}: ${sentence}.`);
  });

  if (why.length === 0) {
    return;
  }

  const told = ws.notes.filter((note) => TOLD.some((said) => note.startsWith(`${index}${said}`)));
  const byHand = told.flatMap((note) => note.match(/^ {2}export .*$/gm) ?? []).map((line) => line.trim());
  const lines = command === 'init' ? [] : [...new Set([...written(before, after), ...byHand])];

  ws.notes.splice(0, ws.notes.length, ...ws.notes.filter((note) => !told.includes(note)));
  ws.leave(index, before.text);

  ws.note(
    `${index} is left as it stood before the command: ${why.join('; ')}.${toDo(ws, config, { command, lines, where: names.toMoveInside(why.length) })}`,
  );
}

/** How the notes a step of the command wrote about the names of the index start, after the path of the index: taken back with it. */
const TOLD = [' lists the ', ': the kit wrote no name in it'];

/** What the command would change, in three: said alone, certain (the index is left), and hanging on what is not read. */
interface Changes {
  /** The tables it wrote out of a tables file. */
  readonly rewritten: string[];
  /** The names it would lose and the names it would move, every file the index re-exports read with certainty. */
  readonly why: string[];
  /** The same, while something is not read with certainty: what the index exports after the command is not known. */
  readonly hedged: string[];
}

/** What is not read with certainty: what the index still names after the command, and what it named before and names no more. */
interface Unread {
  readonly still: readonly string[];
  readonly gone: readonly string[];
}

/** A name that exported one value before the command and another by the lines the kit reads after it. */
interface Move extends LostName {
  readonly is: string;
}

/**
 * What the command would change: the names the index exports, compared, not the tables behind
 * them. Every file the index re-exports read with certainty, a name lost or a name moved is
 * certain. While one is not, before the command or after it, what the index exports after it is
 * not known: each is said hedged, and the index is not left.
 */
function whatChanged(ws: Workspace, config: Config, { before, after, names }: Compared): Changes {
  const sources = workspaceSources(ws, config);
  const lost = names.lost(before, after);
  const isRewritten = ({ was }: LostName): boolean => isWrittenOut(ws, sources, was);
  const losses = lost.filter((named) => !isRewritten(named) && !after.toTheSettle.has(named.name));

  const moves = [...before.names].flatMap(([name, was]): Move[] => {
    const is = after.names.get(name);

    return is === undefined || is === was ? [] : [{ name, was, is, from: before.givers.get(name) ?? fileOfTable(was) }];
  });

  const unread = { still: after.unread, gone: before.unread.filter((file) => !after.unread.includes(file)) };

  const rewritten = [...new Set(lost.filter(isRewritten).map(({ was }) => was))].map((table) =>
    rewrittenOut(names, table),
  );

  if (unread.still.length + unread.gone.length > 0) {
    return { rewritten, why: [], hedged: [...losses.map(hedgedLoss(unread)), ...moves.map(hedgedMove(unread))] };
  }

  return { rewritten, why: [...moves.map(movedName), ...names.lossesSaid(losses)], hedged: [] };
}

function movedName({ name, was, is }: Move): string {
  return `\`${name}\`, which named ${named(was)}, would name ${named(is)}`;
}

/** A name lost while something is not read: it may still come through what the index still names; plainly lost when the index names none of it any more. */
function hedgedLoss({ still, gone }: Unread): (lost: LostName) => string {
  return ({ name, from }) => {
    if (still.length === 0) {
      return `the name \`${name}\`, which '${from}' gave the index, is exported by no line after the command (${noMoreNamed(gone)})`;
    }

    const which = still.length === 1 ? 'it exports' : 'one of them exports';

    return `the name \`${name}\`, which '${from}' gives the index, is exported by no line the kit can read after the command; it may still be exported through ${quotedFiles(still)} if ${which} it`;
  };
}

function hedgedMove({ still, gone }: Unread): (move: Move) => string {
  return ({ name, was, is }) =>
    still.length === 0
      ? `\`${name}\`, which named ${named(was)} by the lines the kit read, names ${named(is)} after the command (${noMoreNamed(gone)})`
      : `\`${name}\`, which named ${named(was)}, may name another table after the command (the kit does not read ${quotedFiles(still)})`;
}

function noMoreNamed(gone: readonly string[]): string {
  return `${quotedFiles(gone)}, which the kit does not read with certainty, ${gone.length === 1 ? 'is' : 'are'} no more named by the index`;
}

/** A table by the name its file gives it and its file: the \`orders\` of '<file>'. */
function named(table: string): string {
  return `the \`${table.slice(table.lastIndexOf('#') + 1)}\` of '${fileOfTable(table)}'`;
}

function quotedFiles(files: readonly string[]): string {
  return files.map((file) => `'${file}'`).join(', ');
}

/** A table the command wrote out of its tables file, and what restores it. */
function rewrittenOut(names: IndexNames, table: string): string {
  const [file = '', name = ''] = table.split('#');

  return `\`${name}\` is no more in ${file}, which the command wrote again without it: restore its declaration there, as git holds it${names.withoutItsTable}`;
}

/** With --force a tables file is written again whole: a table it held and the command does not declare is gone from it, the file read with certainty. */
function isWrittenOut(ws: Workspace, sources: Sources, table: string): boolean {
  const [file = '', name = ''] = table.split('#');
  const read = readTablesFile(sources, file);

  return (
    ws.read(file) !== undefined && read.unread.length === 0 && !read.symbols.some((symbol) => symbol.name === name)
  );
}

/** What to do about it: the lines of a generation, to write by hand, and what leaving them out costs; for `init --force`, where the line belongs. */
function toDo(
  ws: Workspace,
  config: Config,
  { command, lines, where }: { command: string; lines: readonly string[]; where: string },
): string {
  if (command === 'init') {
    return ` \`init --force\` writes the index again from its template, and a line written outside the regions of the kit goes with it: move ${where} and run the command again. Until then every \`init --force\` leaves the index as it stood and exits 3.`;
  }

  if (lines.length === 0) {
    return '';
  }

  const unlisted = lines.flatMap((line) => {
    const context = contextOfSource(ws, config, /^export \* from '([^']+)'/.exec(line)?.[1] ?? '');

    return context === undefined ? [] : [context];
  });

  const cost =
    unlisted.length === 0
      ? ''
      : ` Until these lines are written, the tables of ${unlisted.join(', ')} are listed nowhere: no migration will create them.`;

  return ` To write by hand, where it is right:\n${lines.map((line) => `  ${line}`).join('\n')}\n${cost.trimStart()}`.trimEnd();
}

/** The lines the command wrote in the regions of the index, or anywhere in it. */
function written(before: IndexPicture, after: IndexPicture): string[] {
  const linesOf = (text: string): string[] =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');

  const stood = new Set(linesOf(before.text ?? ''));
  const held = [...(after.text ?? '').matchAll(REGION)].map(([, lines = '']) => lines).join('\n');

  return linesOf(held).filter((line) => !stood.has(line));
}
