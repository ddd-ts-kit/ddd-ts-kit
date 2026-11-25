import { scan } from '../check/scan/scan';
import { boundBy } from './bound-by';
import type { ImportStatement } from './import-statement';
import { lineOf } from './line-of';
import { readImports } from './read-imports';

/** The imports of a source: what they bind, and the source with one more. */
export class ImportStatements {
  private constructor(
    private readonly text: string,
    private readonly code: string,
    readonly all: readonly ImportStatement[],
  ) {}

  static of(text: string): ImportStatements {
    const scanned = scan(text);

    return new ImportStatements(text, scanned.code, readImports(text, scanned));
  }

  /** Whether the source needs nothing of this statement: it binds each of its names, or imports its module when it binds none. */
  holds(wanted: ImportStatement): boolean {
    const names = boundBy(wanted);
    const bound = new Set(this.all.flatMap(boundBy));

    return names.length === 0
      ? this.all.some((statement) => statement.specifier === wanted.specifier)
      : names.every((name) => bound.has(name));
  }

  /**
   * The source with an import statement after its last import, unless it holds it already: on
   * the next line, which a statement sharing the line of that import moves to. A source without
   * imports opens with it, after the line that says what runs the file.
   */
  with(statement: string): string {
    const wanted = ImportStatements.of(statement).all[0];

    if (wanted === undefined) {
      throw new Error(`Not an import statement: ${statement}`);
    }

    if (this.holds(wanted)) {
      return this.text;
    }

    const last = this.all.at(-1);

    return last === undefined ? this.openedWith(statement) : this.after(last, statement);
  }

  private openedWith(statement: string): string {
    const start = this.text.startsWith('#!') ? lineOf(this.text, 0).end + 1 : 0;

    return `${this.text.slice(0, start)}${statement}\n${this.text.slice(start)}`;
  }

  private after(last: ImportStatement, statement: string): string {
    const { end } = lineOf(this.text, last.end);
    const at = this.code.slice(last.end, end).trim() === '' ? end : last.end;

    return `${this.text.slice(0, at)}\n${statement}${this.text.slice(at)}`;
  }
}
