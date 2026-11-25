import type { CliError } from '../cli-error';

/** A source as its objects and its lists read it: the text, its code offset for offset, and the refusal of an edit of its file. */
export interface ReadSource {
  readonly text: string;
  /** The text with comments and the contents of strings blanked. */
  readonly code: string;
  /** The refusal of an edit: what the generator cannot tell, and what to write by hand. */
  cannot(what: string, byHand: string): CliError;
}
