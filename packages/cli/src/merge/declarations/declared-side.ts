import type { Declaration } from './declaration';

/** The declarations of a region as one side of a merge holds it, in their order. */
export interface DeclaredSide {
  readonly declarations: readonly Declaration[];
  /** The blank lines written after the last one. */
  readonly trailing: number;
}
