import { closingBracket } from '../check/text/closing-bracket';
import { ListLiteral } from './list-literal';
import type { ReadSource } from './read-source';
import type { Span } from './span';

const AFTER_A_LIST = /^\s*(?:as\s+const)?\s*$/;

/** One entry of an object written in a source: its value as written, and its list when the value is one. */
export class ObjectEntry {
  constructor(
    private readonly source: ReadSource,
    private readonly value: Span,
  ) {}

  /** The value as the source writes it. */
  get written(): string {
    return this.source.text.slice(this.value.start, this.value.end);
  }

  /** The list the entry holds, undefined when its value is anything else: a name, a call, a spread list. */
  list(): ListLiteral | undefined {
    const { code } = this.source;
    const close = code.charAt(this.value.start) === '[' ? closingBracket(code, this.value.start) : undefined;

    if (close === undefined || close >= this.value.end || !AFTER_A_LIST.test(code.slice(close + 1, this.value.end))) {
      return undefined;
    }

    return new ListLiteral(this.source, this.value.start, close);
  }
}
