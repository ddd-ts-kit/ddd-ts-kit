import { scan } from '../../check/scan/scan';
import type { ConflictBlock } from '../conflict-blocks';
import { bracketsLeftOpen } from './brackets-left-open';

/**
 * Whether the union of the lines of a conflict would pair the brackets of two different
 * statements by chance. The lines each side adds are read in units that pair their own brackets:
 * one line, or a run from a line that opens a bracket to the line that closes it. Two different
 * units that open on the same line, or close on the same line, lose that line once in the union,
 * which keeps each line once; a unit both sides added alike is one unit, kept once as the union
 * keeps it, and never counts.
 */
export function sharesHalfAPair(block: ConflictBlock): boolean {
  const inBase = new Set(unitsOf(block.base).map(textOf));
  const added = [...unitsOf(block.ours), ...unitsOf(block.theirs)].filter((unit) => !inBase.has(textOf(unit)));
  const different = added.filter((unit, at) => added.findIndex((other) => textOf(other) === textOf(unit)) === at);

  return different.some((unit, at) =>
    different.slice(at + 1).some((other) => unit[0] === other[0] || unit.at(-1) === other.at(-1)),
  );
}

function textOf(unit: readonly string[]): string {
  return unit.join('\n');
}

/**
 * The lines of one side of a conflict in units, blank lines left out: a line that pairs its own
 * brackets, a run of lines up to the one that closes what the first opened, a line that closes a
 * bracket the conflict did not open, and what is left open at its end.
 */
function unitsOf(lines: readonly string[]): string[][] {
  const units: string[][] = [];
  let unit: string[] = [];
  let open: number[] = [];

  for (const line of lines.filter((candidate) => candidate.trim() !== '')) {
    const left = bracketsLeftOpen(scan(line).code, open);

    units.push(...(left === undefined && unit.length > 0 ? [unit] : []));
    unit = left === undefined ? [line] : [...unit, line];
    open = left ?? [];

    if (open.length === 0) {
      units.push(unit);
      unit = [];
    }
  }

  return unit.length === 0 ? units : [...units, unit];
}
