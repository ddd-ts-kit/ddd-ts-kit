/** Whether `lines` holds every line of `part`, in the same order. */
export function holdsEveryLine(lines: readonly string[], part: readonly string[]): boolean {
  let from = 0;

  return part.every((line) => {
    const at = lines.indexOf(line, from);

    from = at + 1;

    return at !== -1;
  });
}
