/** A place where a source reaches what a purity table forbids, and how the finding names it. */
export interface ForbiddenUse {
  readonly at: number;
  readonly what: string;
}
