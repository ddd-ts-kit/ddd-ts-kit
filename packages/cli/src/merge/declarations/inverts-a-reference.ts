import type { DeclaredSide } from './declared-side';
import type { DeclaredSides } from './merge-declarations';
import { readsTheName } from './reads-the-name';

/**
 * Whether a region sets a declaration above one it reads, against the sides. A declaration reads
 * another when its code, comments and strings left out, holds the name the other declares, as a
 * whole word. The reference is inverted when the one it reads stands below it in the region,
 * while every side that holds the two sets it above: a side that wrote the reader first, a
 * function that calls one written below it, says the order is meant. Nothing else of the order of
 * a region is read.
 */
export function invertsAReference(read: DeclaredSide, { ours, theirs }: DeclaredSides): boolean {
  const sides = [ours, theirs].map(placesOf);

  return read.declarations.some((reader, at) =>
    read.declarations.slice(at + 1).some((below) => {
      const orders = sides.flatMap((places) => {
        const first = places.get(reader.key);
        const second = places.get(below.key);

        return first === undefined || second === undefined ? [] : [second < first];
      });

      return orders.length > 0 && orders.every((above) => above) && readsTheName(reader, below.name);
    }),
  );
}

/** Where each declaration of a side stands, by its key. */
function placesOf(side: DeclaredSide): Map<string, number> {
  return new Map(side.declarations.map(({ key }, at) => [key, at]));
}
