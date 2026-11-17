import { scan } from '../../check/scan/scan';
import type { ConflictBlock } from '../conflict-blocks';
import { registryUnion } from '../registry-union';
import { bracketsLeftOpen } from './brackets-left-open';
import { GOES_ON } from './declarations-of';

/** How a line ends that the next one goes on with: an operator, an arrow, a dot. */
const LEFT_OPEN = /(?:[=+\-*|&?:.]|=>)$/;

/** Where the lines of a conflict are read: the region they lie in, and whether the file is a schema of Prisma, where a line is a statement. */
export interface ReadAs {
  readonly region: string;
  readonly prisma: boolean;
}

/**
 * Whether the union of the lines of a conflict may set a line of one side inside a statement of
 * the other, or leave a statement without one of its lines, while every bracket still pairs. Two
 * signs, read on the lines alone. A side of the conflict does not hold whole statements: it opens
 * a bracket it does not close, or closes one it did not open, git having cut it in the middle of
 * a declaration. Or a statement a side wrote on several lines (a call, a chain, a block comment,
 * a decorator with what it decorates) is whole neither in the union, which keeps each line once,
 * nor in the base, where the other side changed or removed it.
 */
export function unionInDoubt(block: ConflictBlock, readAs: ReadAs): boolean {
  const sides = [block.ours, block.theirs].map((lines) => statementsOf(lines, readAs.prisma));
  const base = statementsOf(block.base, readAs.prisma);

  if (base === undefined || sides.includes(undefined)) {
    return true;
  }

  const kept = [registryUnion(block, readAs.region), block.base].map((lines) =>
    lines.filter((line) => line.trim() !== ''),
  );

  return sides.some((statements) =>
    (statements ?? []).some((statement) => statement.length > 1 && !kept.some((lines) => holdsRun(lines, statement))),
  );
}

/** Whether `lines` holds the lines of `run` one after the other. */
function holdsRun(lines: readonly string[], run: readonly string[]): boolean {
  return lines.some((_, from) => run.every((line, at) => lines[from + at] === line));
}

/**
 * The lines of one side of a conflict in statements, blank lines and the line comments written
 * between two statements left out: a
 * statement runs until its brackets are closed and the next line does not go on with it, a block
 * comment to its last line, a decorator to the end of what it decorates. Undefined when the side
 * does not pair its brackets.
 */
function statementsOf(lines: readonly string[], prisma: boolean): readonly string[][] | undefined {
  const code = scan(lines.join('\n')).code.split('\n');
  let reading: Reading | undefined = { statements: [], statement: [], open: [], commented: false };

  for (const [at, line] of lines.entries()) {
    const read = (code[at] ?? '').trim();

    reading = reading === undefined ? undefined : followed(reading, { line, read, next: nextOf(code, at), prisma });
  }

  return reading === undefined || reading.open.length > 0 ? undefined : closed(reading).statements;
}

/** The statements read so far, the one being read, the brackets it holds open, and whether it is a block comment. */
interface Reading {
  readonly statements: readonly string[][];
  readonly statement: readonly string[];
  readonly open: readonly number[];
  readonly commented: boolean;
}

/** The reading after one more line; undefined when the line closes a bracket that is not open. */
function followed(reading: Reading, { line, read, next, prisma }: Line): Reading | undefined {
  const comment = read === '' && reading.open.length === 0;

  if (line.trim() === '' || (comment && line.trim().startsWith('//'))) {
    return reading;
  }

  const open = bracketsLeftOpen(read, reading.open);
  const started = comment === reading.commented ? reading : closed(reading);

  if (open === undefined) {
    return undefined;
  }

  const grown = { ...started, statement: [...started.statement, line], open, commented: comment };

  return open.length === 0 && !goesOn({ line, read, next, prisma }, comment) ? closed(grown) : grown;
}

/** A reading whose statement is over: the next line starts another. */
function closed({ statements, statement, open }: Reading): Reading {
  return {
    statements: statement.length > 0 ? [...statements, [...statement]] : statements,
    statement: [],
    open,
    commented: false,
  };
}

/** The code of the first line after `at` that holds some. */
function nextOf(code: readonly string[], at: number): string {
  return (code.slice(at + 1).find((after) => after.trim() !== '') ?? '').trim();
}

/** One line of a side: its text, its code, the code that follows, and whether the file is a schema of Prisma. */
interface Line {
  readonly line: string;
  readonly read: string;
  readonly next: string;
  readonly prisma: boolean;
}

/** Whether the statement a line is the last of so far goes on with the next line: an entry spread into a list starts one of its own. */
function goesOn({ line, read, next, prisma }: Line, comment: boolean): boolean {
  if (comment) {
    return !line.trimEnd().endsWith('*/');
  }

  if (prisma) {
    return false;
  }

  return (
    (GOES_ON.test(next) && !next.startsWith('...')) ||
    LEFT_OPEN.test(read) ||
    (read.startsWith('@') && !read.endsWith(';') && next !== '')
  );
}
