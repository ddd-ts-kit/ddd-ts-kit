import { scan } from '../../check/scan/scan';
import type { Declaration } from './declaration';
import type { DeclaredSide } from './declared-side';
import { declarationsOf } from './declarations-of';
import { invertsAReference } from './inverts-a-reference';
import type { DeclaredSides } from './merge-declarations';
import type { LineMerge } from './merged-lines';
import { readsARemoved } from './reads-a-removed';

/**
 * What the region the union of lines gives reads as: the three sides `merged`, declarations of
 * the two sides `mixed`, or `lines`: a side holds lines that end no statement, entries of a list,
 * which are read as lines only, and the kit has nothing to say of the region.
 */
type ReadBack = 'merged' | 'mixed' | 'lines';

/**
 * Reads the region the union of lines gives against the three sides merged declaration by
 * declaration. It is `merged` when it holds, whole and once, each declaration with the comments
 * above it: the one a side added, changed or removed while the other left it as the base holds
 * it, the one both wrote alike, and for one both changed the lines `lineMerge` gives, those the
 * kit keeps of that declaration merged alone; and when no declaration stands above one it reads,
 * against the sides. It is `mixed` when it is not read with certainty, holds a declaration no
 * side wrote, lacks one, inverts a reference, or when the two sides do not agree on a
 * declaration: one removed it and the other changed it or started to read it, both added it
 * differently, its lines do not merge. The order of the lines of both sides is otherwise theirs to
 * keep, and blank lines are not compared: the lines of both sides keep one of each run.
 */
export function unionReadsAsMerged(union: readonly string[], written: DeclaredSides, lineMerge: LineMerge): ReadBack {
  const sides = { ours: bare(written.ours), base: bare(written.base), theirs: bare(written.theirs) };
  const unread = declarationsOf(union);

  if ([sides.ours, sides.base, sides.theirs].some(holdsAnEntry)) {
    return 'lines';
  }

  const read = unread === undefined ? undefined : withSharedComments(bare(unread), sides);
  const left = read === undefined ? undefined : leftOver(read, sides, lineMerge);

  const mixed =
    read === undefined ||
    left === undefined ||
    !paired(left, lineMerge) ||
    invertsAReference(read, sides) ||
    readsARemoved(sides);

  return mixed ? 'mixed' : 'merged';
}

/** Whether a side holds a statement that declares no name and that no `;` or `}` ends: an entry of a list. */
function holdsAnEntry({ declarations }: DeclaredSide): boolean {
  return declarations.some(
    ({ name, ended, lines }) => name === undefined && !ended && scan(lines.join('\n')).code.trim() !== '',
  );
}

/**
 * The declarations of the union, each with the comment the union kept once for two neighbours: a
 * declaration that stands right under one whose comment a side wrote above it too, word for
 * word, is read with that comment. The two sides each wrote one comment above the declaration
 * each added, and the lines of both sides keep each line once.
 */
function withSharedComments(read: DeclaredSide, sides: DeclaredSides): DeclaredSide {
  const written = [sides.ours, sides.theirs].flatMap(({ declarations }) => declarations);

  const declarations = read.declarations.map((declared, at) => {
    const comment = commentOf(read.declarations[at - 1]);
    const lines = [...comment, ...declared.lines];

    const shared =
      comment.length > 0 &&
      commentOf(declared).length === 0 &&
      written.some((one) => one.name === declared.name && textOf(one.lines) === textOf(lines));

    return shared
      ? { ...declared, lines, key: declared.name === undefined ? `text ${textOf(lines)}` : declared.key }
      : declared;
  });

  return { ...read, declarations };
}

/** The lines of comment a declaration opens with, above its first line of code. */
function commentOf(declared: Declaration | undefined): readonly string[] {
  const lines = declared?.lines ?? [];
  const code = scan(lines.join('\n')).code.split('\n');
  const first = code.findIndex((line) => line.trim() !== '');

  return lines.slice(0, Math.max(first, 0));
}

/**
 * What the keys do not settle: the declarations the union holds that no side wrote, and those a
 * side alone wrote, the union holding them or not. A statement that declares no name has another
 * text on each side that changed it, and the union may hold the three merged into a fourth.
 */
interface LeftOver {
  readonly held: ReadonlySet<string>;
  readonly extra: readonly Declaration[];
  readonly ours: readonly Declaration[];
  readonly theirs: readonly Declaration[];
  /** The statements of the base both sides lack: those they may each have changed. */
  readonly base: readonly Declaration[];
}

/** One declaration by its key: its version on each side, the one the union holds, the lines it is merged into. */
interface Judged extends Versions {
  readonly held: Declaration | undefined;
  readonly expected: readonly string[] | undefined | 'unknown';
}

/**
 * What is left once each declaration is read by its key; undefined when the union holds another
 * text than the one a key is merged into, lacks a declaration both sides hold, or when the two
 * sides do not agree on one.
 */
function leftOver(read: DeclaredSide, sides: DeclaredSides, lineMerge: LineMerge): LeftOver | undefined {
  const inUnion = byKey(read);
  const inOurs = byKey(sides.ours);
  const inBase = byKey(sides.base);
  const inTheirs = byKey(sides.theirs);
  const keys = [...new Set([read, sides.ours, sides.base, sides.theirs].flatMap(keysOf))];

  const judged = keys.map((key): Judged => {
    const versions = { ours: inOurs.get(key), base: inBase.get(key), theirs: inTheirs.get(key) };

    return { ...versions, held: inUnion.get(key), expected: expectedOf(versions, lineMerge) };
  });

  const alone = judged.filter(({ base, expected }) => base === undefined && expected !== undefined);

  return judged.some(isWrong)
    ? undefined
    : {
        held: new Set(read.declarations.map(({ lines }) => textOf(lines))),
        extra: judged.flatMap(({ held, expected }) => (held !== undefined && expected === undefined ? [held] : [])),
        ours: alone.flatMap(({ ours, theirs }) => (ours === undefined || theirs !== undefined ? [] : [ours])),
        theirs: alone.flatMap(({ ours, theirs }) => (theirs === undefined || ours !== undefined ? [] : [theirs])),
        base: judged.flatMap(({ ours, base, theirs }) =>
          base !== undefined && ours === undefined && theirs === undefined ? [base] : [],
        ),
      };
}

/** Whether the union surely holds a key wrong: the two sides do not agree on it, it holds another text, or lacks a declaration both sides hold. */
function isWrong({ ours, theirs, held, expected }: Judged): boolean {
  if (expected === 'unknown') {
    return true;
  }

  return held === undefined
    ? expected !== undefined && ours !== undefined && theirs !== undefined
    : expected !== undefined && textOf(held.lines) !== textOf(expected);
}

/** How many ways of pairing three versions are tried for the statements of a region. */
const TRIED = 64;

/**
 * Whether what the keys do not settle is statements both sides changed, each merged alone: every
 * declaration the union holds that no side wrote, and every one a side alone wrote that the union
 * lacks, is one of three versions whose merge the union holds, the version of a side standing
 * nowhere else in it.
 */
function paired(left: LeftOver, lineMerge: LineMerge): boolean {
  const { held, extra, ours, theirs, base } = left;
  const lacked = [...ours, ...theirs].filter(({ lines }) => !held.has(textOf(lines)));
  const origins = [...base.map(({ lines }) => lines), []];

  if (extra.length === 0 && lacked.length === 0) {
    return true;
  }

  if (ours.length * theirs.length * origins.length > TRIED) {
    return false;
  }

  const merges = ours.flatMap((mine) =>
    theirs.flatMap((other) =>
      mergesOf({ mine, other, origins }, left, lineMerge).map((text) => ({ mine, other, text })),
    ),
  );

  return (
    extra.every(({ lines }) => merges.some(({ text }) => text === textOf(lines))) &&
    lacked.every((declared) => merges.some(({ mine, other }) => mine === declared || other === declared))
  );
}

/** A statement of each side that may be one of the base, changed, with the statements of the base it may be. */
interface Pair {
  readonly mine: Declaration;
  readonly other: Declaration;
  readonly origins: readonly (readonly string[])[];
}

/** The texts the union holds that a statement of each side merges into: each of the two stands there as that text, or not at all. */
function mergesOf({ mine, other, origins }: Pair, { held }: LeftOver, lineMerge: LineMerge): string[] {
  const texts = origins.flatMap((base) => textOf(lineMerge({ ours: mine.lines, base, theirs: other.lines })) ?? []);

  const fits = (text: string, { lines }: Declaration): boolean => textOf(lines) === text || !held.has(textOf(lines));

  return texts.filter((text) => held.has(text) && fits(text, mine) && fits(text, other));
}

/** The versions of one declaration, by side. */
interface Versions {
  readonly ours: Declaration | undefined;
  readonly base: Declaration | undefined;
  readonly theirs: Declaration | undefined;
}

/** The lines a declaration is merged into, undefined when it is removed, `unknown` when the two sides do not agree on it. */
function expectedOf({ ours, base, theirs }: Versions, lineMerge: LineMerge): readonly string[] | undefined | 'unknown' {
  if (same(ours, theirs) || same(theirs, base)) {
    return ours?.lines;
  }

  if (same(ours, base)) {
    return theirs?.lines;
  }

  return ours === undefined || base === undefined || theirs === undefined
    ? 'unknown'
    : (lineMerge({ ours: ours.lines, base: base.lines, theirs: theirs.lines }) ?? 'unknown');
}

function same(one: Declaration | undefined, other: Declaration | undefined): boolean {
  return textOf(one?.lines) === textOf(other?.lines);
}

/** The text a declaration is compared by: its lines, the blank ones left out, which the lines of both sides keep once. */
function textOf(lines: readonly string[]): string;
function textOf(lines: readonly string[] | undefined): string | undefined;

function textOf(lines: readonly string[] | undefined): string | undefined {
  return lines?.filter((line) => line.trim() !== '').join('\n');
}

/** A side whose statements that declare no name are known by their text, blank lines left out. */
function bare(side: DeclaredSide): DeclaredSide {
  const declarations = side.declarations.map((declared) =>
    declared.name === undefined ? { ...declared, key: `text ${textOf(declared.lines)}` } : declared,
  );

  return { ...side, declarations };
}

function keysOf(side: DeclaredSide): string[] {
  return side.declarations.map(({ key }) => key);
}

function byKey(side: DeclaredSide): Map<string, Declaration> {
  return new Map(side.declarations.map((declaration) => [declaration.key, declaration]));
}
