/** `startFrom` was given a word it does not take: one it took before the brokers shared a vocabulary, or an unknown one. */
export class StartFromRefusedError extends Error {
  readonly code = 'START_FROM_REFUSED';

  constructor(given: string, replacement = "'beginning' or 'end'") {
    super(`startFrom: '${given}' is refused: write startFrom: ${replacement}`);

    this.name = 'StartFromRefusedError';
  }
}
