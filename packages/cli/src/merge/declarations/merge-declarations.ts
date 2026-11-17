import type { Declaration } from './declaration';
import type { DeclaredSide } from './declared-side';
import { holdsEveryLine } from './holds-every-line';
import { leadOf } from './lead-of';
import type { LineMerge } from './merged-lines';

/** The three sides of a region, each read as declarations. */
export interface DeclaredSides {
  readonly ours: DeclaredSide;
  readonly base: DeclaredSide;
  readonly theirs: DeclaredSide;
}

/** A declaration of the merged region: the one kept, or the versions the two sides do not agree on. */
export type MergedDeclaration =
  | { readonly kind: 'kept'; readonly declaration: Declaration }
  | {
      readonly kind: 'conflict';
      readonly ours: Declaration | undefined;
      readonly base: Declaration | undefined;
      readonly theirs: Declaration | undefined;
    };

/**
 * Why a region is not merged by declaration: a side changed or removed a statement of the base
 * that declares no name, the two sides differ on entries of a list, which no line ends, each
 * added a nameless statement that may be the other's written again, or both changed the order of
 * the declarations they share, each its own way.
 */
export type Refusal = 'unnamed' | 'entries' | 'twice' | 'order';

/** The declarations of a merged region, and the side whose order and blank lines it follows. */
export interface MergedRegion {
  readonly merged: readonly MergedDeclaration[];
  readonly lead: DeclaredSide;
}

/**
 * The declarations of a region merged three ways, each whole: what one side added, changed or
 * removed is taken when the other left that declaration as the base holds it, a declaration both
 * wrote alike is kept once, one both changed takes the merge of its lines when they merge without
 * a conflict, and one the two sides wrote differently, or one removed and the other changed, is a
 * conflict. The declarations both sides hold stand in the order of the side that changed it, ours
 * when none did; what a side alone brings stands after the declaration it follows on that side.
 * Refused when nothing says which statement of the other side a statement is, or which order holds.
 */
export function mergeDeclarations(sides: DeclaredSides, lineMerge: LineMerge): MergedRegion | { refused: Refusal } {
  const refused = refusalOf(sides);
  const lead = refused === undefined ? leadOf(sides) : undefined;

  if (refused !== undefined || lead === undefined) {
    return { refused: refused ?? 'order' };
  }

  const inBase = byKey(sides.base);
  const inOurs = byKey(sides.ours);
  const inTheirs = byKey(sides.theirs);
  const follower = lead === sides.ours ? sides.theirs : sides.ours;
  const inLead = byKey(lead);

  const versionsOf = (key: string): Versions => ({
    ours: inOurs.get(key),
    base: inBase.get(key),
    theirs: inTheirs.get(key),
  });

  const merged = lead.declarations.flatMap(({ key }) => placed(key, settled(versionsOf(key), lineMerge)));

  follower.declarations.forEach(({ key }, at) => {
    const brought = inLead.has(key) ? [] : placed(key, settled(versionsOf(key), lineMerge));

    merged.splice(placeAfter(merged, follower.declarations.slice(0, at)), 0, ...brought);
  });

  return { merged: merged.map(({ item }) => item), lead };
}

/** What makes the statements of a region impossible to pair between the sides, if anything does. */
function refusalOf({ ours, base, theirs }: DeclaredSides): Refusal | undefined {
  const inOurs = byKey(ours);
  const inTheirs = byKey(theirs);
  const onBoth = ({ key }: Declaration): boolean => inOurs.has(key) && inTheirs.has(key);

  const nameless = (declarations: readonly Declaration[]): Declaration[] =>
    declarations.filter(({ name }) => name === undefined);

  if (nameless([...ours.declarations, ...theirs.declarations]).some((entry) => !entry.ended && !onBoth(entry))) {
    return 'entries';
  }

  if (!nameless(base.declarations).every(onBoth)) {
    return 'unnamed';
  }

  const alone = (side: DeclaredSide, other: ReadonlyMap<string, Declaration>): Declaration[] =>
    nameless(side.declarations).filter(({ key }) => !other.has(key));

  return alone(ours, inTheirs).some((mine) => alone(theirs, inOurs).some((other) => mayBeOne(mine, other)))
    ? 'twice'
    : undefined;
}

/** Whether two statements open alike and one holds every line of the other: one statement written twice, or two, nothing says which. */
function mayBeOne(one: Declaration, other: Declaration): boolean {
  return (
    one.lines[0] === other.lines[0] &&
    (holdsEveryLine(one.lines, other.lines) || holdsEveryLine(other.lines, one.lines))
  );
}

/** A declaration of the merged region with its key: what the other side brings finds its place by it. */
interface Placed {
  readonly key: string;
  readonly item: MergedDeclaration;
}

function placed(key: string, items: readonly MergedDeclaration[]): Placed[] {
  return items.map((item) => ({ key, item }));
}

/** Where what a side alone brings goes: after the nearest declaration above it on that side that the merged region holds, else first. */
function placeAfter(merged: readonly Placed[], above: readonly Declaration[]): number {
  const anchor = above.findLast(({ key }) => merged.some((held) => held.key === key));

  return anchor === undefined ? 0 : merged.findLastIndex((held) => held.key === anchor.key) + 1;
}

function byKey(side: DeclaredSide): Map<string, Declaration> {
  return new Map(side.declarations.map((declaration) => [declaration.key, declaration]));
}

/** The versions of one declaration, by side. */
interface Versions {
  readonly ours: Declaration | undefined;
  readonly base: Declaration | undefined;
  readonly theirs: Declaration | undefined;
}

function settled(versions: Versions, lineMerge: LineMerge): MergedDeclaration[] {
  const { ours, base, theirs } = versions;

  if (same(ours, theirs) || same(theirs, base)) {
    return kept(ours);
  }

  if (same(ours, base)) {
    return kept(theirs);
  }

  const lines =
    ours === undefined || base === undefined || theirs === undefined
      ? undefined
      : lineMerge({ ours: ours.lines, base: base.lines, theirs: theirs.lines });

  return lines === undefined || ours === undefined ? [{ kind: 'conflict', ...versions }] : kept({ ...ours, lines });
}

function kept(declaration: Declaration | undefined): MergedDeclaration[] {
  return declaration === undefined ? [] : [{ kind: 'kept', declaration }];
}

function same(one: Declaration | undefined, other: Declaration | undefined): boolean {
  return one?.lines.join('\n') === other?.lines.join('\n');
}
