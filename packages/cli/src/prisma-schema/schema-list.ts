/** A list of strings assigned in a block of a Prisma schema: `schemas = ["messaging", "audit"]`, on one line or several. */
export class SchemaList {
  constructor(
    private readonly text: string,
    private readonly code: string,
    private readonly open: number,
    private readonly close: number,
  ) {}

  /** The strings of the list, in their order. */
  get items(): string[] {
    return this.strings().map(({ start, end }) => this.text.slice(start + 1, end - 1));
  }

  /** The schema with the item last in the list, after the last one it holds, unless it holds it. */
  with(item: string): string {
    if (this.items.includes(item)) {
      return this.text;
    }

    const last = this.strings().at(-1);
    const [at, written] = last === undefined ? [this.open + 1, `"${item}"`] : [last.end, `, "${item}"`];

    return `${this.text.slice(0, at)}${written}${this.text.slice(at)}`;
  }

  private strings(): { start: number; end: number }[] {
    return [...this.code.slice(this.open, this.close).matchAll(/"[^"]*"/g)].map((found) => ({
      start: this.open + found.index,
      end: this.open + found.index + found[0].length,
    }));
  }
}
