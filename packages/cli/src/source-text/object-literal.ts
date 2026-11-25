import { fitStatement } from '../layout';
import { lineOf } from './line-of';
import { ObjectEntry } from './object-entry';
import { partsBetween } from './parts-between';
import type { ReadSource } from './read-source';
import type { Span } from './span';

const STEP = '  ';

/** An object written between braces in a source: its entries by their key, and the source with one more. */
export class ObjectLiteral {
  private readonly entries: readonly Span[];

  constructor(
    private readonly source: ReadSource,
    private readonly name: string,
    private readonly open: number,
    private readonly close: number,
  ) {
    this.entries = partsBetween(source.code, open, close);
  }

  /** The entry written under one of these keys, each key as the source may spell it (`[Role.Admin]`, `admin`, `'admin'`). */
  entry(...keys: readonly string[]): ObjectEntry | undefined {
    for (const entry of this.entries) {
      const value = keys.flatMap((key) => this.valueUnder(key, entry))[0];

      if (value !== undefined) {
        return new ObjectEntry(this.source, value);
      }
    }

    return undefined;
  }

  /**
   * The source with an entry on a line of its own: before the entry of `before` when the object
   * has it, else last. Refused, with `byHand` as what to do, when the object does not give each
   * entry a line: nothing then says where the new one goes.
   */
  withEntry(entry: string, { before, byHand }: { readonly before?: string; readonly byHand: string }): string {
    const { text, code } = this.source;
    const next = before === undefined ? undefined : this.entries.find(({ start }) => text.startsWith(before, start));
    const at = lineOf(text, next?.start ?? this.close);

    if (code.slice(at.start, next?.start ?? this.close).trim() !== '') {
      throw this.source.cannot(
        `the object of \`${this.name}\` does not ${next === undefined ? 'close' : `open the entry of ${before}`} on a line of its own, so the generator cannot tell where a new entry goes`,
        byHand,
      );
    }

    const indent = next === undefined ? this.indentOfEntries(at.indent) : at.indent;

    return `${this.closed(at.start)}${fitStatement(entry, indent).join('\n')}\n${text.slice(at.start)}`;
  }

  private valueUnder(key: string, entry: Span): Span[] {
    const { text, code } = this.source;
    const colon = /^\s*:\s*/.exec(code.slice(entry.start + key.length, entry.end));

    return text.startsWith(key, entry.start) && colon !== null
      ? [{ start: entry.start + key.length + colon[0].length, end: entry.end }]
      : [];
  }

  private indentOfEntries(closing: string): string {
    const last = this.entries.at(-1);

    return last === undefined ? `${closing}${STEP}` : lineOf(this.source.text, last.start).indent;
  }

  /** The source up to an offset, the entry written before it closed by a comma when it has none. */
  private closed(offset: number): string {
    const { text } = this.source;
    const previous = this.entries.findLast(({ end }) => end <= offset);

    if (previous === undefined || /^\s*,/.test(this.source.code.slice(previous.end, offset))) {
      return text.slice(0, offset);
    }

    return `${text.slice(0, previous.end)},${text.slice(previous.end, offset)}`;
  }
}
