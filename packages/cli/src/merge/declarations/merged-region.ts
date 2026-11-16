import { regionsOf } from '../../markers';
import type { ConflictedPath } from '../conflicted-path';
import type { DeclaredSide } from './declared-side';
import { declarationsOf } from './declarations-of';
import { type ConflictLabels, declaredLines } from './declared-lines';
import { type MergedDeclaration, mergeDeclarations, type Refusal } from './merge-declarations';
import { mergedLines } from './merged-lines';
import { readsAsMerged } from './reads-as-merged';
import { shownOf } from './shown-of';
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
 * sides cannot be paired or ordered, or the merged lines do not read back as the declarations merged.
 */
export function mergedRegion(name: string, path: ConflictedPath, { top, labels, blocks }: Given): RegionOutcome {
  const ours = sideOf(path.ours, name);
  const theirs = sideOf(path.theirs, name);
  const base = sideOf(path.base, name);

  if (ours === undefined || theirs === undefined || base === undefined) {
    return unread(name, blocks);
  }

  const imports = name === 'imports' ? mergedImports({ ours, base, theirs }) : undefined;

  if (imports !== undefined) {
    return { lines: imports };
  }

  const outcome = mergeDeclarations({ ours, base, theirs }, (versions) => mergedLines(top, versions));

  const why = whyNot(outcome);

  if ('refused' in outcome || why !== undefined) {
    return unread(name, blocks, why);
  }

  const lines = declaredLines(outcome.merged, outcome.lead, labels);
  const conflicts = outcome.merged.flatMap((item) => (item.kind === 'conflict' ? [item] : []));

  return conflicts.length === 0
    ? { lines }
    : { lines, held: { advice: adviceOf(name, conflicts), blocks: conflicts.length } };
}

/** Why a region is not written as merged: its declarations were not merged, they do not read back, or they give the file two default exports. */
function whyNot(outcome: ReturnType<typeof mergeDeclarations>): Why | undefined {
  if ('refused' in outcome) {
    return outcome.refused;
  }

  if (!readsAsMerged(outcome.merged, outcome.lead)) {
    return 'unread';
  }

  return outcome.merged.filter(exportsADefault).length > 1 ? 'defaults' : undefined;
}

/** A default export in either spelling: `export default ...` or `export { name as default }`. */
const DEFAULT_EXPORT = /^\s*export\s+(?:default\b|(?:type\s+)?\{[^}]*\bas\s+default\b)/;

/** Whether a declaration of the merged region, in the version of a side when it is left to a person, gives the file its default export. */
function exportsADefault(item: MergedDeclaration): boolean {
  return shownOf(item)?.lines.some((line) => DEFAULT_EXPORT.test(line)) === true;
}

type Why = Refusal | 'unread' | 'defaults';

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
  defaults:
    'holds a default export of each side, and a file has one: write the one the file keeps, whole, and export what the other side declared under a name.',
};

function unread(name: string, blocks: number, why: Why = 'unread'): RegionOutcome {
  return { lines: undefined, held: { advice: `the region \`${name}\` ${WHY[why]}`, blocks } };
}

/** What to do of the declarations left: each named when both sides hold it, the region when a side removed one. */
function adviceOf(name: string, conflicts: readonly Extract<MergedDeclaration, { kind: 'conflict' }>[]): string {
  const names = conflicts.map(({ ours, theirs }) =>
    ours === undefined || theirs === undefined ? undefined : ours.name,
  );

  const what = names.includes(undefined)
    ? `in the region \`${name}\`: for each hunk`
    : `on ${names.map((declared) => `\`${declared}\``).join(', ')} in the region \`${name}\`: for each`;

  return `the two sides do not agree ${what}, write the one declaration that keeps the intent of both, whole, or remove it.`;
}

/** The declarations a side holds in its one region of that name; undefined when it holds none, several, or one that is not read. */
function sideOf(text: string | undefined, name: string): DeclaredSide | undefined {
  const lines = (text ?? '').split('\n');
  const regions = regionsOf(lines).filter((region) => region.name === name);
  const [region] = regions;

  return region === undefined || regions.length > 1
    ? undefined
    : declarationsOf(lines.slice(region.open + 1, region.close));
}
