import { conflictBlocks } from '../conflict-blocks';
import { registryUnion } from '../registry-union';
import { mergedFile, type Versions } from './merged-file';
import { sharesHalfAPair } from './shares-half-a-pair';
import { type ReadAs, unionInDoubt } from './union-in-doubt';

/**
 * The lines the kit keeps of one declaration both sides changed, merged alone as it merges a
 * region: what git merges, and for each conflict left the lines of both sides. Undefined when one
 * of those conflicts is in doubt, a side of it not holding whole statements or its union breaking
 * one, or when git cannot merge the versions.
 */
export function linesOfBothSides(top: string, versions: Versions, readAs: ReadAs): string[] | undefined {
  const segments = conflictBlocks((mergedFile(top, versions, true) ?? [UNMERGED]).join('\n'));
  const [first] = segments;

  const inDoubt = segments.some(
    (segment) => segment.kind === 'conflict' && (sharesHalfAPair(segment) || unionInDoubt(segment, readAs)),
  );

  return inDoubt || (first?.kind === 'settled' && first.lines[0] === UNMERGED)
    ? undefined
    : segments.flatMap((segment) =>
        segment.kind === 'settled' ? segment.lines : registryUnion(segment, readAs.region),
      );
}

/** What stands for a merge git did not compute: a line no declaration starts with. */
const UNMERGED = '>>>>>>> not merged';
