/** The answer of a phase that does not let a call in: none before this instant. */
export class Refused {
  constructor(readonly retryAt: number) {}
}
