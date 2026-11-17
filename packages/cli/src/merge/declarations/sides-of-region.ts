import { regionsOf } from '../../markers';
import type { ConflictedPath } from '../conflicted-path';
import type { DeclaredSide } from './declared-side';
import { declarationsOf } from './declarations-of';
import type { DeclaredSides } from './merge-declarations';

/** The three sides of a region of a conflicted file, each read as declarations; undefined when one of them, the base among them, does not hold it once or is not read with certainty. */
export function sidesOfRegion(name: string, path: ConflictedPath): DeclaredSides | undefined {
  const ours = sideOf(path.ours, name);
  const theirs = sideOf(path.theirs, name);
  const base = sideOf(path.base, name);

  return ours === undefined || theirs === undefined || base === undefined ? undefined : { ours, base, theirs };
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
