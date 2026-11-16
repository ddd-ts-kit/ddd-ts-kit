import type { Declaration } from './declaration';
import type { DeclaredSide } from './declared-side';
import type { MergedDeclaration } from './merge-declarations';
import { shownOf } from './shown-of';

/** The marker lines of a conflict, as the merge wrote them for the file. */
export interface ConflictLabels {
  readonly ours: string;
  readonly base: string;
  readonly theirs: string;
}

/**
 * The lines of a merged region: each declaration whole, set apart as its side wrote it, and each
 * one the two sides do not agree on as one conflict that holds its three versions whole.
 */
export function declaredLines(
  merged: readonly MergedDeclaration[],
  ours: DeclaredSide,
  labels: ConflictLabels,
): string[] {
  const leading = ours.declarations[0]?.gap ?? 0;

  const lines = merged.flatMap((item, at) => {
    const previous = merged[at - 1];
    const gap = gapOf(shownOf(item), previous === undefined ? undefined : shownOf(previous), leading);

    return [...Array<string>(gap).fill(''), ...linesOf(item, labels)];
  });

  return [...lines, ...Array<string>(ours.trailing).fill('')];
}

/**
 * The blank lines above a declaration: those its side wrote. The one that opens the merged region
 * stands as our side opens it, and one that opened its side stands apart from several lines.
 */
function gapOf(shown: Declaration | undefined, previous: Declaration | undefined, leading: number): number {
  if (previous === undefined) {
    return leading;
  }

  if (shown === undefined || !shown.first) {
    return shown?.gap ?? 0;
  }

  return shown.lines.length > 1 || previous.lines.length > 1 ? 1 : 0;
}

function linesOf(item: MergedDeclaration, labels: ConflictLabels): readonly string[] {
  if (item.kind === 'kept') {
    return item.declaration.lines;
  }

  return [
    labels.ours,
    ...(item.ours?.lines ?? []),
    labels.base,
    ...(item.base?.lines ?? []),
    '=======',
    ...(item.theirs?.lines ?? []),
    labels.theirs,
  ];
}
