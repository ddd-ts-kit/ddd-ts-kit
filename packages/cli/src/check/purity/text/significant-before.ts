/** Offset of the last character before `at` that is not white space, -1 when there is none. */
export function significantBefore(code: string, at: number): number {
  let offset = at - 1;

  while (offset >= 0 && /\s/.test(code.charAt(offset))) {
    offset -= 1;
  }

  return offset;
}
