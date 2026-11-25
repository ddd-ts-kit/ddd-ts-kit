const WORD_AT_THE_END = /([\w$]+)\s*$/;

/** The word that ends right before `at`, white space apart: `new` before the `Date` of `new Date()`; empty when a sign stands there. */
export function wordBefore(code: string, at: number): string {
  return WORD_AT_THE_END.exec(code.slice(Math.max(0, at - 40), at))?.[1] ?? '';
}
