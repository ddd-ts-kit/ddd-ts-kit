/** Whether the globs of a workspace list a folder: a glob that starts with `!` leaves out what the others list. */
export function listedBy(globs: readonly string[], folder: string): boolean {
  const matches = (glob: string): boolean =>
    new RegExp(`^${sourceOf(glob.replace(/^\.\//, '').replace(/\/$/, ''))}$`).test(folder);

  const left = globs.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1));

  return globs.some((glob) => !glob.startsWith('!') && matches(glob)) && !left.some(matches);
}

const WILDCARDS: Record<string, string | undefined> = { '**/': '(?:.+/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' };

/** `*` stands for one folder, `**` for any depth, `?` for one character, `{a,b}` for either. */
function sourceOf(glob: string): string {
  return glob
    .split(/(\*\*\/|\*\*|\*|\?|\{[^}]*\})/)
    .map((part) =>
      part.startsWith('{')
        ? `(?:${part.slice(1, -1).split(',').map(sourceOf).join('|')})`
        : (WILDCARDS[part] ?? part.replace(/[.+^$()|[\]\\]/g, '\\$&')),
    )
    .join('');
}
