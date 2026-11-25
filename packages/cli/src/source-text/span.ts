/** A stretch of a source text: from the offset of its first character to the offset after its last. */
export interface Span {
  readonly start: number;
  readonly end: number;
}
