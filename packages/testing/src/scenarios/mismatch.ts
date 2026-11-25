import { AssertionError } from 'node:assert';

export interface Mismatch {
  /** The assertion that failed, as the test wrote it: `thenEvents`, `expectRefusal`. */
  readonly operator: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  /** The lists under the sentence, by title and in order: `{ Expected, Recorded, Difference }`. */
  readonly sections?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The failure of an assertion of this package, in one shape: a sentence, then what was expected,
 * what was there and where the two differ, each a titled list numbered from 1. An `AssertionError`
 * of `node:assert`, so it reads the same under any runner, which shows `actual` against `expected`.
 */
export function mismatch(sentence: string, { sections = {}, ...compared }: Mismatch): AssertionError {
  const message = [sentence, ...Object.entries(sections).flatMap(([title, lines]) => section(title, lines))];

  return new AssertionError({ message: message.join('\n'), ...compared });
}

function section(title: string, lines: readonly string[]): string[] {
  return [`${title}:`, ...(lines.length === 0 ? ['  (none)'] : lines.map((line, index) => `  ${index + 1}. ${line}`))];
}
