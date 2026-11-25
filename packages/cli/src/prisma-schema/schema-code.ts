const COMMENT_OR_STRING = /\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"/g;

/**
 * A Prisma schema with its comments and the contents of its strings blanked, offset for offset:
 * what a block, an assignment or a bracket is looked for in, so that a comment that shows an old
 * list or a connection string that holds `//` is never taken for the schema.
 */
export function schemaCode(text: string): string {
  return text.replace(COMMENT_OR_STRING, (found) =>
    found.startsWith('"') ? `"${' '.repeat(found.length - 2)}"` : ' '.repeat(found.length),
  );
}
