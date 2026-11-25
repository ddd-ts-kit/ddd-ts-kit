/** The file of a table a picture names `<file>#<name>`. */
export function fileOfTable(table: string): string {
  return table.slice(0, Math.max(table.lastIndexOf('#'), 0));
}
