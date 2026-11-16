import type { DeclaredSide } from './declared-side';
import { declarationsOf } from './declarations-of';
import { declaredLines } from './declared-lines';
import type { MergedDeclaration } from './merge-declarations';
import { shownOf } from './shown-of';

const NO_LABELS = { ours: '', base: '', theirs: '' };

/**
 * Whether the lines a merged region is written with read back as the declarations merged, each
 * whole, in their order, every bracket paired: the last check before anything is written. A
 * declaration left to a person is read as the version of one side.
 */
export function readsAsMerged(merged: readonly MergedDeclaration[], ours: DeclaredSide): boolean {
  const shown = merged.flatMap((item) => {
    const declaration = shownOf(item);

    return declaration === undefined ? [] : [{ kind: 'kept' as const, declaration }];
  });

  const read = declarationsOf(declaredLines(shown, ours, NO_LABELS));
  const texts = shown.map(({ declaration }) => declaration.lines.join('\n'));

  return read?.declarations.map(({ lines }) => lines.join('\n')).join('\n\0') === texts.join('\n\0');
}
