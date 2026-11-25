/** What a command did not write: the files it would not replace, those it could not write, those it put back. */
interface Unwritten {
  readonly skipped: ReadonlySet<string>;
  readonly unwritable: readonly string[];
  readonly left: ReadonlySet<string>;
}

/**
 * The files a command changed and those it left, as its report names them. A file it would not
 * replace and then added to (the tables of a context, which a second table joins) is reported
 * once, as updated.
 */
export function updatedAndSkipped(
  written: readonly { readonly file: string; readonly existed: boolean }[],
  { skipped, unwritable, left }: Unwritten,
): { updated: string[]; skipped: string[] } {
  const updated = written.filter(({ existed, file }) => existed && !left.has(file)).map(({ file }) => file);
  const notReplaced = [...skipped].filter((file) => !updated.includes(file));

  return { updated, skipped: [...new Set([...notReplaced, ...unwritable, ...left])].sort() };
}
