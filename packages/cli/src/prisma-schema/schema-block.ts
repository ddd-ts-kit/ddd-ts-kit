import { escapeRegExp } from '../check/text/escape-reg-exp';
import { schemaCode } from './schema-code';
import { SchemaList } from './schema-list';

/**
 * A `datasource` or `generator` block of a Prisma schema, read in its code: the lists it assigns,
 * and the schema with one more assignment. Every edit stays inside the block, whatever the text
 * around it looks like.
 */
export class SchemaBlock {
  private constructor(
    private readonly text: string,
    private readonly code: string,
    private readonly open: number,
    private readonly close: number,
  ) {}

  /** The block a line opens with this head (`datasource \w+`, `generator client`), undefined when the schema has none. */
  static of(text: string, head: string): SchemaBlock | undefined {
    const code = schemaCode(text);
    const opened = new RegExp(`^${head}\\s*\\{`, 'm').exec(code);
    const open = opened === null ? -1 : opened.index + opened[0].length - 1;
    const close = code.indexOf('}', open);

    return open === -1 || close === -1 ? undefined : new SchemaBlock(text, code, open, close);
  }

  /** The list assigned to a key of the block, undefined when the block assigns none. */
  list(key: string): SchemaList | undefined {
    const inside = this.code.slice(this.open, this.close);
    const assigned = new RegExp(`^[ \\t]*${escapeRegExp(key)}[ \\t]*=[ \\t]*\\[`, 'm').exec(inside);
    const open = assigned === null ? -1 : this.open + assigned.index + assigned[0].length - 1;
    const close = this.code.indexOf(']', open);

    return open === -1 || close === -1 || close > this.close
      ? undefined
      : new SchemaList(this.text, this.code, open, close);
  }

  /** The schema with one more assignment, last in the block, its `=` under those of the block. */
  withAssignment(key: string, value: string): string {
    const column = /^([ \t]*\w+[ \t]*)=/m.exec(this.code.slice(this.open, this.close))?.[1]?.length ?? 0;
    const at = this.text.lastIndexOf('\n', this.close) + 1;

    return `${this.text.slice(0, at)}${`  ${key} `.padEnd(column)}= ${value}\n${this.text.slice(at)}`;
  }
}
