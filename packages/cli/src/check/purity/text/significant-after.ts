/** Offset of the first character from `at` on that is not white space, the length of the code when there is none. */
export function significantAfter(code: string, at: number): number {
  let offset = at;

  while (offset < code.length && /\s/.test(code.charAt(offset))) {
    offset += 1;
  }

  return offset;
}
