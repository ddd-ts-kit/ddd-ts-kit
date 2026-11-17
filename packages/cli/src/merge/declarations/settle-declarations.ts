import { scan } from '../../check/scan/scan';
import { REGION_MARKER, type Region, regionsOf } from '../../markers';
import { type ConflictBlock, conflictBlocks } from '../conflict-blocks';
import type { ConflictedPath } from '../conflicted-path';
import { registryUnion } from '../registry-union';
import { bracketsLeftOpen } from './brackets-left-open';
import type { ConflictLabels } from './declared-lines';
import { linesOfBothSides } from './lines-of-both-sides';
import { importsReadAsMerged } from './imports-read-as-merged';
import { type HeldRegion, mergedRegion } from './merged-region';
import { sharesHalfAPair } from './shares-half-a-pair';
import { sidesOfRegion } from './sides-of-region';
import type { ReadAs } from './union-in-doubt';
import { unionReadsAsMerged } from './union-reads-as-merged';

/** What the merge of the declarations of a file gives. */
export interface SettledDeclarations {
  /** The text of the merge, each region of declarations that could be merged written again. */
  readonly content: string;
  /** The regions the union of lines would break, by name, that it must not settle: what is left of each to a person. */
  readonly held: ReadonlyMap<string, HeldRegion>;
  /** Whether a region was merged declaration by declaration. */
  readonly merged: boolean;
}

/**
 * Merges, in the text a merge wrote for a file, each generated region in which the lines of both
 * sides, kept, would not give the two sides merged. They leave a declaration open: git sets two
 * tables, two models or two functions added at one place side by side and keeps the lines they
 * share once, so that the union of the lines no longer pairs their brackets. Or they pair them
 * and the region they give, read back, is not the declarations of the three sides merged one by
 * one: a line of one side stands inside a declaration of the other, a declaration lacks a line,
 * stands twice, came back, or stands above one it reads. Such a region is merged from the
 * three sides of the file, declaration by declaration. Any other region is left to the union of
 * lines, untouched: `top` is the repository the lines of a declaration both sides changed are
 * merged in.
 */
export function settleDeclarations(path: ConflictedPath, top: string): SettledDeclarations {
  const text = path.merged ?? '';
  const owners = ownersOf(text);
  const lines = text.split('\n');
  const held = new Map<string, HeldRegion>();
  let merged = false;
  const frame = regionsOf(lines.map((line, at) => (owners[at] === undefined ? line : '')));
  const written: string[] = [];
  let from = 0;

  for (const region of frame.filter((candidate) => unionIsWrong(candidate, { path, top, lines, owners }))) {
    const blocks = blocksIn(region, owners);
    const outcome = mergedRegion(region.name, path, { top, labels: labelsOf(blocks[0]), blocks: blocks.length });

    if ('held' in outcome) {
      held.set(region.name, outcome.held);
      // A conflict in a region written inside this one is a conflict of this one: no union settles it either.
      innerNames(lines.slice(region.open + 1, region.close)).forEach((inner) => held.set(inner, NOTHING_MORE));
    }

    if (outcome.lines !== undefined) {
      written.push(...lines.slice(from, region.open + 1), ...outcome.lines);
      from = region.close;
      merged = true;
    }
  }

  return { content: [...written, ...lines.slice(from)].join('\n'), held, merged };
}

/** A region written inside one that is left: its conflicts are counted with those of the outer one. */
const NOTHING_MORE: HeldRegion = { advice: '', blocks: 0 };

/** The names of the regions whose markers these lines hold. */
function innerNames(lines: readonly string[]): string[] {
  return lines.flatMap((line) => REGION_MARKER.exec(line)?.[2] ?? []);
}

/** For each line of the text of a merge, the conflict it is a line of. */
function ownersOf(text: string): (ConflictBlock | undefined)[] {
  return conflictBlocks(text).flatMap((segment) =>
    segment.kind === 'conflict'
      ? Array<ConflictBlock | undefined>(segment.raw.length).fill(segment)
      : Array<ConflictBlock | undefined>(segment.lines.length).fill(undefined),
  );
}

/** The conflicts that lie in a region, each once. */
function blocksIn(region: Region, owners: readonly (ConflictBlock | undefined)[]): ConflictBlock[] {
  return [...new Set(owners.slice(region.open + 1, region.close))].flatMap((owner) =>
    owner === undefined ? [] : [owner],
  );
}

/** The text of a merge and what it is read with: its lines, the conflict each is a line of, the three sides of the file. */
interface Merge {
  readonly path: ConflictedPath;
  readonly top: string;
  readonly lines: readonly string[];
  readonly owners: readonly (ConflictBlock | undefined)[];
}

/**
 * Whether the lines of both sides, kept as the registry keeps them, give a region that is not the
 * two sides merged. Three cases. The region the union of lines writes does not pair its brackets.
 * It pairs them by chance, two different statements added in one conflict opening or closing on
 * one line the union keeps once. Or it pairs them and does not read back as the declarations of
 * the three sides merged one by one. A region with no conflict, or with one that holds a marker,
 * which no union settles, is not concerned.
 */
function unionIsWrong(region: Region, { path, top, lines, owners }: Merge): boolean {
  const blocks = blocksIn(region, owners);
  const sides = blocks.flatMap((block) => [...block.ours, ...block.base, ...block.theirs]);

  if (blocks.length === 0 || sides.some((line) => REGION_MARKER.test(line))) {
    return false;
  }

  const union = lines.slice(region.open + 1, region.close).flatMap((line, at) => {
    const owner = owners[region.open + 1 + at];

    if (owner === undefined) {
      return [line];
    }

    return owner === owners[region.open + at] ? [] : registryUnion(owner, region.name);
  });

  return (
    blocks.some(sharesHalfAPair) ||
    bracketsLeftOpen(scan(union.join('\n')).code)?.length !== 0 ||
    !readsAsMerged(union, { name: region.name, path, top })
  );
}

/** A region of a conflicted file: its name, the three sides of the file, the repository. */
interface Sided {
  readonly name: string;
  readonly path: ConflictedPath;
  readonly top: string;
}

/**
 * Whether the region the union of lines gives is the two sides merged. It is read back against
 * the three sides merged declaration by declaration, and kept when it reads as that merge. It is
 * kept too, as it always was, when the kit has nothing certain to read it against: a side is not
 * read with certainty, or the two sides differ on lines that end no statement, read as lines
 * only. The `imports` region is read by what it brings.
 */
function readsAsMerged(union: readonly string[], { name, path, top }: Sided): boolean {
  const readAs: ReadAs = { region: name, prisma: path.file.endsWith('.prisma') };
  const sides = sidesOfRegion(name, path);

  if (sides === undefined || (name === 'imports' && importsReadAsMerged(union, sides))) {
    return true;
  }

  return unionReadsAsMerged(union, sides, (versions) => linesOfBothSides(top, versions, readAs)) !== 'mixed';
}

/** The marker lines of the first conflict of a region: the declarations left to a person are written with the same. */
function labelsOf(block: ConflictBlock | undefined): ConflictLabels {
  const base = block?.raw[block.ours.length + 1] ?? '';

  return {
    ours: block?.raw[0] ?? '<<<<<<< ours',
    base: base.startsWith('|||||||') ? base : '||||||| base',
    theirs: block?.raw.at(-1) ?? '>>>>>>> theirs',
  };
}
