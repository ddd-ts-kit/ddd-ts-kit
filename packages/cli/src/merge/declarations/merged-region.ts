import type { ConflictedPath } from '../conflicted-path';
import type { Declaration } from './declaration';
import type { DeclaredSide } from './declared-side';
import { type ConflictLabels, declaredLines } from './declared-lines';
import { type DeclaredSides, type MergedDeclaration, mergeDeclarations, type Refusal } from './merge-declarations';
import { mergedLines } from './merged-lines';
import { invertsAReference } from './inverts-a-reference';
import { readsARemoved } from './reads-a-removed';
import { readsAsMerged } from './reads-as-merged';
import { shownOf } from './shown-of';
import { sidesOfRegion } from './sides-of-region';
import { mergedImports } from './merged-imports';

/** What a region of declarations leaves to a person. */
export interface HeldRegion {
  /** How to settle it. */
  readonly advice: string;
  /** How many conflicts of the file lie in it. */
  readonly blocks: number;
}

/** The lines a region of declarations is written again with, and what it leaves to a person. */
export type RegionOutcome =
  | { readonly lines: readonly string[] }
  | { readonly lines: readonly string[] | undefined; readonly held: HeldRegion };

/** What the merge of a region is given: the repository, the marker lines of its conflicts, how many it holds. */
interface Given {
  readonly top: string;
  readonly labels: ConflictLabels;
  readonly blocks: number;
}

/**
 * A region of a conflicted file merged from its three sides, declaration by declaration. Its
 * lines hold a conflict for each declaration the two sides do not agree on. Nothing is written,
 * and the conflicts git wrote stay for a person, when the region is not read with certainty: a
 * side, the base among them, does not hold it once or cannot be read, the declarations of the
 * sides cannot be paired or ordered, the merged lines do not read back as the declarations merged, a
 * side removed a declaration the other started to read, or a declaration would stand above one it reads.
 */
export function mergedRegion(name: string, path: ConflictedPath, { top, labels, blocks }: Given): RegionOutcome {
  const sides = sidesOfRegion(name, path);

  if (sides === undefined) {
    return unread(name, blocks);
  }

  const imports = name === 'imports' ? mergedImports(sides) : undefined;

  if (imports !== undefined) {
    return { lines: imports };
  }

  const outcome = mergeDeclarations(sides, (versions) => mergedLines(top, versions));

  const why = whyNot(outcome, sides);

  if ('refused' in outcome || why !== undefined) {
    return unread(name, blocks, why);
  }

  const lines = declaredLines(outcome.merged, outcome.lead, labels);
  const conflicts = outcome.merged.flatMap((item) => (item.kind === 'conflict' ? [item] : []));

  return conflicts.length === 0
    ? { lines }
    : {
        lines,
        held: { advice: `${adviceOf(name, conflicts)}${renamedOf(conflicts, sides)}`, blocks: conflicts.length },
      };
}

/**
 * Why a region is not written as merged: its declarations were not merged, they do not read
 * back, a side removed one the other started to read, the merged region sets one above a
 * declaration it reads against the sides, or they give the file two default exports.
 */
function whyNot(outcome: ReturnType<typeof mergeDeclarations>, sides: DeclaredSides): Why | undefined {
  if ('refused' in outcome) {
    return outcome.refused === 'unnamed' && !oneSideAlone(sides) ? 'gone' : outcome.refused;
  }

  if (!readsAsMerged(outcome.merged, outcome.lead)) {
    return 'unread';
  }

  if (readsARemoved(sides)) {
    return 'removed';
  }

  const declarations = outcome.merged.flatMap((item) => shownOf(item) ?? []);

  if (invertsAReference({ declarations, trailing: 0 }, sides)) {
    return 'above';
  }

  return outcome.merged.filter(exportsADefault).length > 1 ? 'defaults' : undefined;
}

/**
 * Whether a side changed or removed a statement of the base that declares no name and the other
 * did not do the same: one side alone holds it as the base does, or a side wrote a statement the
 * base does not hold, which may be that one changed. Otherwise both removed it.
 */
function oneSideAlone({ ours, base, theirs }: DeclaredSides): boolean {
  const keys = (side: DeclaredSide): Set<string> => new Set(side.declarations.map(({ key }) => key));
  const inOurs = keys(ours);
  const inTheirs = keys(theirs);
  const inBase = keys(base);
  const nameless = (side: DeclaredSide): Declaration[] => side.declarations.filter(({ name }) => name === undefined);

  return (
    nameless(base).some(({ key }) => inOurs.has(key) !== inTheirs.has(key)) ||
    [...nameless(ours), ...nameless(theirs)].some(({ key }) => !inBase.has(key))
  );
}

/** A default export in either spelling: `export default ...` or `export { name as default }`. */
const DEFAULT_EXPORT = /^\s*export\s+(?:default\b|(?:type\s+)?\{[^}]*\bas\s+default\b)/;

/** Whether a declaration of the merged region, in the version of a side when it is left to a person, gives the file its default export. */
function exportsADefault(item: MergedDeclaration): boolean {
  return shownOf(item)?.lines.some((line) => DEFAULT_EXPORT.test(line)) === true;
}

type Why = Refusal | 'unread' | 'gone' | 'removed' | 'above' | 'defaults';

const WHOLE =
  ', and its hunks show lines, not whole declarations: keep each declaration of both sides whole, once, its brackets closed';

/** What stops the merge of a region by declaration, and what to do of its hunks, said to the person they are left to. */
const WHY: Readonly<Record<Why, string>> = {
  unread: `holds declarations of several lines the kit could not read with certainty${WHOLE}.`,
  unnamed: `holds a statement that declares no name and that one side changed or removed, which the kit does not merge${WHOLE}.`,
  entries: `holds lines that end no statement (entries of a list, or statements written without \`;\`) on which the two sides differ, which the kit does not merge one by one${WHOLE}.`,
  twice:
    'holds two statements with no declared name that open alike, one holding every line of the other, which the kit cannot tell from one statement written twice, and its hunks show lines, not whole statements: write it once if it is one statement, each whole if they are two.',
  order: `holds declarations the two sides set in two different orders${WHOLE}, in the order that holds for both.`,
  gone: `holds a statement that declares no name and that both sides removed, which the kit does not merge${WHOLE}.`,
  above: `holds a declaration that would stand above one it reads once the two sides are merged${WHOLE}, in the order that holds for both.`,
  removed: `holds a declaration one side removed and that a declaration the other side wrote reads${WHOLE}, the one removed kept or the other written without it.`,
  defaults:
    'holds a default export of each side, and a file has one: write the one the file keeps, whole, and export what the other side declared under a name.',
};

function unread(name: string, blocks: number, why: Why = 'unread'): RegionOutcome {
  return { lines: undefined, held: { advice: `the region \`${name}\` ${WHY[why]}`, blocks } };
}

/** What to do of the declarations left: each named when both sides hold it, the region when a side removed one. */
function adviceOf(name: string, conflicts: readonly Conflict[]): string {
  const names = conflicts.map(({ ours, theirs }) =>
    ours === undefined || theirs === undefined ? undefined : ours.name,
  );

  const what = names.includes(undefined)
    ? `in the region \`${name}\`: for each hunk`
    : `on ${names.map((declared) => `\`${declared}\``).join(', ')} in the region \`${name}\`: for each`;

  return `the two sides do not agree ${what}, write the one declaration that keeps the intent of both, whole, or remove it.`;
}

/** One declaration the two sides do not agree on. */
type Conflict = Extract<MergedDeclaration, { kind: 'conflict' }>;

/**
 * What is said more when one side removed a declaration the other changed and that side also
 * wrote one neither the base nor the other side holds: the kit cannot tell a declaration given
 * another name from one replaced by another.
 */
function renamedOf(conflicts: readonly Conflict[], sides: DeclaredSides): string {
  const keys = (side: DeclaredSide): Set<string> => new Set(side.declarations.map(({ key }) => key));
  const inBase = keys(sides.base);

  const wroteAnother = (side: DeclaredSide, other: DeclaredSide): boolean =>
    side.declarations.some(({ key }) => !inBase.has(key) && !keys(other).has(key));

  const renamed = conflicts.some(
    ({ ours, base, theirs }) =>
      base !== undefined &&
      ((ours === undefined && wroteAnother(sides.ours, sides.theirs)) ||
        (theirs === undefined && wroteAnother(sides.theirs, sides.ours))),
  );

  return renamed
    ? ' If a declaration of the side that removed it is this one under another name, write the change there and remove the hunk.'
    : '';
}
