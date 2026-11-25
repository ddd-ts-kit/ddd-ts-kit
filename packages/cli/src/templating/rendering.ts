import { CliError } from '../cli-error';
import type { RenderContext, RenderValue } from './render-context';

/** What reads as a tag and is none the renderer knows; `${{ ... }}` is an expression of a GitHub workflow. */
const LEFTOVER = /(?<!\$)\{\{[^}]*\}\}/;

/** One rendering in progress: the text kept so far and the blocks that are open. */
export class Rendering {
  private output = '';

  /** One entry per open block: whether its content is kept. */
  private readonly open: boolean[] = [];

  constructor(
    private readonly context: RenderContext,
    private readonly origin: string,
  ) {}

  /**
   * The text of the template between two tags. What looks like a tag there is one the template
   * leaves unread: it is refused here, in what the template wrote, never in a value it was given,
   * which may hold braces of its own (the title of a decision record, the purpose of a context).
   */
  text(text: string): void {
    if (!this.emitting()) {
      return;
    }

    const leftover = LEFTOVER.exec(text);

    if (leftover !== null) {
      throw this.failure(`leftover placeholder "${leftover[0]}"`);
    }

    this.output += text;
  }

  tag(block: string | undefined, path: string): void {
    if (block === '#if' || block === '#unless') {
      this.open.push(this.condition(path) === (block === '#if'));
    } else if (block !== undefined) {
      if (this.open.pop() === undefined) {
        throw this.failure(`"{{${block}}}" closes nothing`);
      }
    } else if (this.emitting()) {
      this.output += this.value(path);
    }
  }

  result(): string {
    if (this.open.length > 0) {
      throw this.failure('an "{{#if}}" block is never closed');
    }

    return this.output;
  }

  private emitting(): boolean {
    return this.open.every(Boolean);
  }

  private condition(path: string): boolean {
    const value = lookup(this.context, path);

    if (typeof value === 'boolean') {
      return value;
    }

    throw this.failure(`condition "${path}" is not a known boolean`);
  }

  private value(path: string): string {
    const value = lookup(this.context, path);

    if (value === undefined || typeof value === 'object') {
      throw this.failure(`unknown placeholder "{{${path}}}"`);
    }

    return String(value);
  }

  private failure(problem: string): CliError {
    return new CliError(`${this.origin}: ${problem}`, 'Fix the template or pass the missing variable to the renderer.');
  }
}

function lookup(context: RenderContext, path: string): RenderValue | undefined {
  let current: RenderValue | undefined = context;

  for (const key of path.split('.')) {
    if (typeof current !== 'object') {
      return undefined;
    }

    current = current[key];
  }

  return current;
}
