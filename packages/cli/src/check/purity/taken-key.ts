/** A key a declaration takes out of a value by destructuring, with the offset it is written at. */
export interface TakenKey {
  readonly name: string;
  readonly at: number;
}
