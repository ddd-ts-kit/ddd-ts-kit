/** Each import statement on one line, whatever the number of lines it was written on. */
export function oneLineImports(present: readonly string[]): string[] {
  const statements: string[] = [];
  let open: string[] | undefined;

  for (const line of present.map((candidate) => candidate.trim())) {
    if (open === undefined && /^import (?:type )?\{$/.test(line)) {
      open = [line];
    } else if (open === undefined) {
      statements.push(line);
    } else if (line.startsWith('}')) {
      statements.push(`${open[0] ?? ''} ${open.slice(1).join(' ').replace(/,$/, '')} ${line}`);
      open = undefined;
    } else {
      open.push(line);
    }
  }

  return [...statements, ...(open ?? [])];
}
