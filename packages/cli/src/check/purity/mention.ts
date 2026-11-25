/** A place where a source names a global and means it: `Date`, `globalThis.Date`, `(Date)`, with the offsets of all that names it. */
export interface Mention {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}
