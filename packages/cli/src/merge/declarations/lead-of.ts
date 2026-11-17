import type { Declaration } from './declaration';
import type { DeclaredSide } from './declared-side';

/** The two sides of a region and its base, each read as declarations. */
interface Sides {
  readonly ours: DeclaredSide;
  readonly base: DeclaredSide;
  readonly theirs: DeclaredSide;
}

/**
 * The side whose order the merged region follows: ours, unless the trunk alone changed the order
 * of the declarations both sides hold. Undefined when the two sides order them differently and
 * the base does not say that one of them left that order alone.
 */
export function leadOf({ ours, base, theirs }: Sides): DeclaredSide | undefined {
  const shared = new Set(ours.declarations.map(({ key }) => key).filter((key) => byKey(theirs).has(key)));

  const orderOf = (side: DeclaredSide, among: ReadonlySet<string> = shared): string =>
    side.declarations.flatMap(({ key }) => (among.has(key) ? [key] : [])).join('\0');

  if (orderOf(ours) === orderOf(theirs)) {
    return ours;
  }

  const kept = new Set(base.declarations.map(({ key }) => key).filter((key) => shared.has(key)));
  const moved = [ours, theirs].filter((side) => orderOf(side, kept) !== orderOf(base, kept));

  return moved.length === 1 ? moved[0] : undefined;
}

function byKey(side: DeclaredSide): Map<string, Declaration> {
  return new Map(side.declarations.map((declaration) => [declaration.key, declaration]));
}
