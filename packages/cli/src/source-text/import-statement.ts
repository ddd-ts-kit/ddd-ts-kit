import type { Span } from './span';

/** One `import` statement of a source, from its keyword to its end, as the source writes it. */
export interface ImportStatement extends Span {
  readonly specifier: string;
  /** Written `import type`. */
  readonly typeOnly: boolean;
  /** What it binds before its braces, as written: a default import, `* as name`, both, or nothing. */
  readonly whole: readonly string[];
  /** What it binds between its braces, each as written: `A`, `type B`, `c as d`. */
  readonly named: readonly string[];
  /** The quote of its specifier and whether a `;` ends it: the style of the file. */
  readonly quote: string;
  readonly endsWithSemicolon: boolean;
  /** A comment is written inside it: rewriting the statement would lose it or let it swallow code. */
  readonly holdsComment: boolean;
}
