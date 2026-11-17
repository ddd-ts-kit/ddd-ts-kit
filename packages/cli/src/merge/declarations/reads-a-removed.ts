import type { Declaration } from './declaration';
import type { DeclaredSide } from './declared-side';
import type { DeclaredSides } from './merge-declarations';
import { readsTheName } from './reads-the-name';

/**
 * Whether a side removed a declaration the other left as the base holds it, while that other
 * side wrote or changed a declaration that reads it and whose base version, if any, did not: one
 * removed what the other started to read, and no merge of the two holds for both.
 */
export function readsARemoved({ ours, base, theirs }: DeclaredSides): boolean {
  return startedToRead(ours, base, theirs) || startedToRead(theirs, base, ours);
}

/** Whether a side started to read a declaration it left alone and the other side removed. */
function startedToRead(keeper: DeclaredSide, base: DeclaredSide, remover: DeclaredSide): boolean {
  const inBase = byKey(base);
  const removed = new Set(remover.declarations.map(({ key }) => key));

  const gone = keeper.declarations.filter(
    (kept) => kept.name !== undefined && !removed.has(kept.key) && same(kept, inBase.get(kept.key)),
  );

  return keeper.declarations.some((written) => {
    const before = inBase.get(written.key);

    return (
      !same(written, before) &&
      gone.some(
        ({ key, name }) =>
          key !== written.key && readsTheName(written, name) && !(before !== undefined && readsTheName(before, name)),
      )
    );
  });
}

function byKey(side: DeclaredSide): Map<string, Declaration> {
  return new Map(side.declarations.map((declaration) => [declaration.key, declaration]));
}

function same(one: Declaration, other: Declaration | undefined): boolean {
  return one.lines.join('\n') === other?.lines.join('\n');
}
