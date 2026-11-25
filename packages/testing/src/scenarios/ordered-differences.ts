import { counted } from './counted';

export interface OrderedComparison<Item, Matcher> {
  /** What the list holds, in the singular: `event`, `command`. */
  readonly noun: string;
  /** What happened to what the list holds: an event is `recorded`, a command `decided`. */
  readonly verb: string;
  /** Why the item is not the one the matcher describes, each line starting with `where`. */
  readonly mismatches: (item: Item, matcher: Matcher, where: string) => string[];
}

/**
 * Where a list differs from the matchers expected in the same order: the two counts when they
 * differ (`expected 2 events, recorded 1 event`), then each item against its matcher, named by
 * its position from 1 (`event 1.amount: expected 99, recorded 10`).
 */
export function orderedDifferences<Item, Matcher>(
  actual: readonly Item[],
  expected: readonly Matcher[],
  { noun, verb, mismatches }: OrderedComparison<Item, Matcher>,
): string[] {
  const counts =
    actual.length === expected.length
      ? []
      : [`expected ${counted(expected.length, noun)}, ${verb} ${counted(actual.length, noun)}`];

  const items = expected.flatMap((matcher, index) => {
    const item = actual[index];

    return item === undefined ? [] : mismatches(item, matcher, `${noun} ${index + 1}`);
  });

  return [...counts, ...items];
}
