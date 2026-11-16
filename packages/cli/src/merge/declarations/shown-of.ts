import type { Declaration } from './declaration';
import type { MergedDeclaration } from './merge-declarations';

/** The declaration that says how an item is set apart: the one kept, else the first side that holds one. */
export function shownOf(item: MergedDeclaration): Declaration | undefined {
  return item.kind === 'kept' ? item.declaration : (item.ours ?? item.theirs);
}
