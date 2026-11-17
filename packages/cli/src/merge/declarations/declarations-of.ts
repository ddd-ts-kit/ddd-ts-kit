import { scan } from '../../check/scan/scan';
import { REGION_MARKER } from '../../markers';
import { bracketsLeftOpen } from './brackets-left-open';
import type { Declaration } from './declaration';
import type { DeclaredSide } from './declared-side';

/** A line that declares a name outside any bracket: a constant, a function, a class, a type, an enum, a model of Prisma. */
const NAMED =
  /^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+enum|const|let|var|function\s*\*?|class|interface|type|enum|namespace|module|model|view)\s+([A-Za-z_$][\w$]*)/;

/** A default export written as a declaration or an expression. */
const DEFAULT = /^\s*export\s+default\b/;

/** How the last line of a statement ends once its brackets are closed: a comma goes on with a second name or a type argument. */
const ENDS = /[;}]$/;

/** How a line starts that goes on with the statement above it, whatever that one ends with but a semicolon. */
export const GOES_ON = /^(?:[|&?:.+\-*/=]|satisfies\b|as\b)/;

/** The declaration being read: its lines, the brackets it holds open, the name it declares. */
interface Reading {
  readonly lines: readonly string[];
  readonly open: readonly number[];
  readonly name: string | undefined;
  /** Whether a line of it holds code: comments alone wait for the declaration they stand above. */
  readonly code: boolean;
  /** How many of its last lines hold no code: the comments of the declaration that may follow. */
  readonly tail: number;
  /** The margin of the line that declares its name. */
  readonly margin: number;
  readonly gap: number;
  /** Whether a line that ends a statement closed it, not a blank line, another name or the end of the region. */
  readonly ended: boolean;
}

/** What one more line makes of a reading: the one that goes on, and the one it closed. */
interface Step {
  readonly reading: Reading;
  readonly closed: readonly Reading[];
}

/**
 * The lines of a region read as declarations, each whole: a statement runs until its brackets are
 * closed and its line ends it (a closing brace does not when the next line goes on with an
 * operator), until a blank line outside any bracket, or until a line that declares another name
 * outside any bracket; the comments above it are its own. Undefined when the region cannot be read with certainty: a bracket that does not
 * pair, a text the lexer may have taken for code, a region written inside it, or two declarations
 * of one name.
 */
export function declarationsOf(lines: readonly string[]): DeclaredSide | undefined {
  const scanned = scan(lines.join('\n'));

  if (scanned.uncertain || lines.some((line) => REGION_MARKER.test(line))) {
    return undefined;
  }

  const read = readings(lines, scanned.code.split('\n'));

  if (read === undefined) {
    return undefined;
  }

  const left = read.last.lines.length > 0;
  const declarations = [...read.closed, ...(left ? [read.last] : [])].map(declared);
  const keys = new Set(declarations.map(({ key }) => key));

  return keys.size === declarations.length ? { declarations, trailing: left ? 0 : read.last.gap } : undefined;
}

/** Each declaration a line closed, and the one the last line left; undefined when a bracket does not pair. */
function readings(lines: readonly string[], code: readonly string[]): { closed: Reading[]; last: Reading } | undefined {
  const closed: Reading[] = [];
  let reading = blank(0);

  for (const [at, line] of lines.entries()) {
    const next = code.slice(at + 1).find((after) => after.trim() !== '') ?? '';
    const step = followed(reading, { line, code: (code[at] ?? '').trim(), goesOn: GOES_ON.test(next.trim()) });

    if (step === undefined) {
      return undefined;
    }

    closed.push(...step.closed);
    reading = step.reading;
  }

  return reading.open.length > 0 ? undefined : { closed, last: reading };
}

function blank(gap: number): Reading {
  return { lines: [], open: [], name: undefined, code: false, tail: 0, margin: 0, gap, ended: false };
}

/** One line of a region: its text, its code, and whether the code that follows goes on with the statement it is a line of. */
interface Line {
  readonly line: string;
  readonly code: string;
  readonly goesOn: boolean;
}

/** The reading after one more line; undefined when the line closes a bracket that is not open. */
function followed(reading: Reading, { line, code, goesOn }: Line): Step | undefined {
  const apart = line.trim() === '' && reading.open.length === 0 ? setApart(reading, goesOn) : undefined;

  if (apart !== undefined) {
    return apart;
  }

  const second = startsAnother(reading, line, code);
  const grown = withLine(second ? afterNamed(reading) : reading, line, code);
  const before = second ? [beforeNamed(reading)] : [];

  if (grown === undefined) {
    return undefined;
  }

  return grown.code && grown.open.length === 0 && ends(code, goesOn)
    ? { reading: blank(0), closed: [...before, { ...grown, ended: true }] }
    : { reading: grown, closed: before };
}

/** Whether a line ends its statement once its brackets are closed: a semicolon does, a closing brace unless the next line goes on. */
function ends(code: string, goesOn: boolean): boolean {
  return code.endsWith(';') || (ENDS.test(code) && !goesOn);
}

/**
 * What a blank line outside any bracket makes of a reading: one more above a declaration to come,
 * the end of one that holds code unless the code after it goes on with it.
 */
function setApart(reading: Reading, goesOn: boolean): Step | undefined {
  if (reading.lines.length === 0) {
    return { reading: { ...reading, gap: reading.gap + 1 }, closed: [] };
  }

  return reading.code && !goesOn ? { reading: blank(1), closed: [reading] } : undefined;
}

/** Whether a line declares another name where the declaration read so far declared its own: outside any bracket, no deeper in the margin. */
function startsAnother(reading: Reading, line: string, code: string): boolean {
  return (
    reading.open.length === 0 &&
    reading.name !== undefined &&
    nameOf(code) !== undefined &&
    marginOf(line) <= reading.margin
  );
}

function marginOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** A declaration without the comments written under its last line of code: they stand above the one that follows. */
function beforeNamed(reading: Reading): Reading {
  return { ...reading, lines: reading.lines.slice(0, reading.lines.length - reading.tail), tail: 0 };
}

/** The reading a second name starts: the comments the declaration before it ended with. */
function afterNamed(reading: Reading): Reading {
  return { ...blank(0), lines: reading.lines.slice(reading.lines.length - reading.tail) };
}

/** A reading with one more line: the brackets it leaves open, the name it declares when it is written outside any. */
function withLine(reading: Reading, line: string, code: string): Reading | undefined {
  const open = bracketsLeftOpen(code, reading.open);
  const named = reading.open.length === 0 ? nameOf(code) : undefined;

  return open === undefined
    ? undefined
    : {
        ...reading,
        lines: [...reading.lines, line],
        open,
        name: reading.name ?? named,
        margin: reading.name === undefined && named !== undefined ? marginOf(line) : reading.margin,
        code: reading.code || code !== '',
        tail: code === '' ? reading.tail + 1 : 0,
      };
}

/** The name a line declares; a default export that declares none is `default`. */
function nameOf(code: string): string | undefined {
  return NAMED.exec(code)?.[1] ?? (DEFAULT.test(code) ? 'default' : undefined);
}

function declared({ lines, name, gap, ended }: Reading, at: number): Declaration {
  return {
    ended,
    key: name === undefined ? `text ${lines.join('\n')}` : `name ${name}`,
    ...(name === undefined ? {} : { name }),
    lines,
    gap,
    first: at === 0,
  };
}
