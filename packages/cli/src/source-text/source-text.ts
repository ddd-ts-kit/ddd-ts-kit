import { scan, type Scan } from '../check/scan/scan';
import { closingBracket } from '../check/text/closing-bracket';
import { escapeRegExp } from '../check/text/escape-reg-exp';
import { CliError } from '../cli-error';
import { ObjectLiteral } from './object-literal';
import type { ReadSource } from './read-source';

/**
 * A source file a generator edits in place, read once: every place is found in its code, so a
 * comment, a string or a template that names a key, a class or an import is never taken for it.
 * Rule of the model: a place it cannot tell with certainty is refused with what to write by hand,
 * never guessed, so a command never reports a write that landed elsewhere.
 */
export class SourceText implements ReadSource {
  private constructor(
    readonly file: string,
    readonly text: string,
    private readonly scanned: Scan,
  ) {}

  static of(file: string, text: string): SourceText {
    return new SourceText(file, text, scan(text));
  }

  get code(): string {
    return this.scanned.code;
  }

  /** The object a `const` of this name is given, undefined when the source declares none it opens with a brace. */
  objectAssignedTo(name: string): ObjectLiteral | undefined {
    const declared = new RegExp(`(?<![\\w$.])const\\s+${escapeRegExp(name)}(?![\\w$])[^=;]*=\\s*\\{`).exec(this.code);
    const open = declared === null ? undefined : declared.index + declared[0].length - 1;
    const close = open === undefined ? undefined : closingBracket(this.code, open);

    return open === undefined || close === undefined ? undefined : new ObjectLiteral(this, name, open, close);
  }

  cannot(what: string, byHand: string): CliError {
    return new CliError(`${this.file}: ${what}.`, byHand);
  }
}
