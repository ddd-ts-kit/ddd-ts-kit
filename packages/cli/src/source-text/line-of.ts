/** The line of a text that holds an offset: where it starts, where it ends (before its line break), and its indentation. */
export interface Line {
  readonly start: number;
  readonly end: number;
  readonly indent: string;
}

export function lineOf(text: string, offset: number): Line {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const feed = text.indexOf('\n', offset);
  const end = feed === -1 ? text.length : feed;

  return { start, end, indent: /^[ \t]*/.exec(text.slice(start, end))?.[0] ?? '' };
}
