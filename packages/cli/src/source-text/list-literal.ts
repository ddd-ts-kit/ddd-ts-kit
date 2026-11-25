import { fitStatement } from '../layout';
import { lineOf } from './line-of';
import { partsBetween } from './parts-between';
import type { ReadSource } from './read-source';
import type { Span } from './span';

const STEP = '  ';

/** A list written between brackets in a source: what it holds, and the source with one more item. */
export class ListLiteral {
  private readonly items: readonly Span[];

  constructor(
    private readonly source: ReadSource,
    private readonly open: number,
    private readonly close: number,
  ) {
    this.items = partsBetween(source.code, open, close);
  }

  has(item: string): boolean {
    return this.items.some(({ start, end }) => this.source.text.slice(start, end) === item);
  }

  /**
   * The source with the item last in the list, unless the list holds it: on a line of its own
   * when the list takes several lines, else on the line of the list, laid out again when it no
   * longer fits.
   */
  with(item: string): string {
    if (this.has(item)) {
      return this.source.text;
    }

    return this.takesSeveralLines() ? this.withLine(item) : this.onItsLine(item);
  }

  private takesSeveralLines(): boolean {
    return this.source.text.slice(this.open, this.close).includes('\n');
  }

  private withLine(item: string): string {
    const { text, code } = this.source;
    const closing = lineOf(text, this.close);
    const last = this.items.at(-1);

    if (code.slice(closing.start, this.close).trim() !== '') {
      // The bracket closes on the line of the last item: the new one follows it there.
      return `${this.closed(text.slice(0, this.close).trimEnd())} ${item}${text.slice(this.close)}`;
    }

    const head =
      last === undefined
        ? text.slice(0, closing.start)
        : this.closed(text.slice(0, last.end)) + text.slice(this.afterComma(last.end), closing.start);

    return `${head}${closing.indent}${STEP}${item},\n${text.slice(closing.start)}`;
  }

  /** The text that ends with an item, a comma after it. */
  private closed(head: string): string {
    return head.endsWith(',') || head.endsWith('[') ? head : `${head},`;
  }

  /** The offset after the comma that follows an item, or after the item when it has none. */
  private afterComma(end: number): number {
    const comma = /^\s*,/.exec(this.source.code.slice(end, this.close));

    return comma === null ? end : end + comma[0].length;
  }

  private onItsLine(item: string): string {
    const { text } = this.source;
    const line = lineOf(text, this.open);
    const end = lineOf(text, this.close).end;

    const held = text
      .slice(this.open + 1, this.close)
      .trim()
      .replace(/,\s*$/, '');

    const written = `${text.slice(line.start, this.open + 1)}${held === '' ? item : `${held}, ${item}`}${text.slice(this.close, end)}`;

    return `${text.slice(0, line.start)}${fitStatement(written.trim(), line.indent).join('\n')}${text.slice(end)}`;
  }
}
