import { closingBracket } from '../check/text/closing-bracket';
import { escapeRegExp } from '../check/text/escape-reg-exp';
import { blockAfter } from './block-after';

/** Where the body of a class opens and closes in its source, braces included. */
export interface ClassBody {
  readonly open: number;
  readonly close: number;
}

/** The body of the class of this name in a blanked source, after its type parameters and what it extends or implements. */
export function classBody(code: string, className: string): ClassBody | undefined {
  const declared = new RegExp(`(?<![\\w$.])class\\s+${escapeRegExp(className)}(?![\\w$])`).exec(code);
  const open = declared === null ? undefined : blockAfter(code, declared.index + declared[0].length);
  const close = open === undefined ? undefined : closingBracket(code, open);

  return open === undefined || close === undefined ? undefined : { open, close };
}
