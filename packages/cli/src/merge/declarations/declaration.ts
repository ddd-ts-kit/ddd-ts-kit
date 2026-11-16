/** One declaration of a generated region: a table, a model, a function, with the comments written above it. */
export interface Declaration {
  /** What makes it the same declaration on two sides: the name it declares, else its text. */
  readonly key: string;
  /** The name it declares, when it declares one. */
  readonly name?: string;
  readonly lines: readonly string[];
  /** Whether a line that ends a statement closes it: an entry of a list, ended by a comma, is closed by a blank line or the end of the region. */
  readonly ended: boolean;
  /** The blank lines written above it. */
  readonly gap: number;
  /** Whether it opens the region on its side: nothing above it says how it is set apart. */
  readonly first: boolean;
}
