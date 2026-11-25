import { commentLines } from '../comments/comment-lines';
import type { Finding } from '../model/finding';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';

const ANY = /:\s*any(?![\w$])|(?<![\w$.])as\s+any(?![\w$])|<\s*any\s*[>,]|,\s*any\s*>|(?<![\w$.])any\s*\[\]/g;
const NON_NULL = /(?<=[\w$)\]])!(?=\s*(?:[.;,)\]}:]|\[|$))(?!\s*==?)/gm;
const SILENCER = /^@ts-(ignore|nocheck|expect-error)\b(.*)$|^(eslint-disable(?:-next-line|-line)?)\b(.*)$/;

const ANY_FIX =
  'Give the real type, or `unknown` narrowed by a check: any switches the compiler off for everything that touches the value.';

const NON_NULL_FIX =
  'Handle the absent case: narrow with a check, give a default, or throw an error that says what was expected.';

const SILENCER_FIX =
  'Fix the diagnostic; if it cannot be fixed, use @ts-expect-error or eslint-disable-next-line <rule> followed by the reason and its decision record (`-- ADR-NNNN: why`).';

export const cleanNoEscapeHatch: FileRule = {
  id: 'clean/no-escape-hatch',
  description:
    'No any, no non-null assertion, no @ts-ignore, no @ts-expect-error without a reason, no eslint-disable without a reason.',
  severity: 'error',
  doc: {
    why: 'any, the non-null assertion and suppressed diagnostics tell the compiler to stop checking, and the error it would have reported comes back at run time, far from its cause. When one is really needed, the written reason is what lets a reviewer judge it.',
    bad: `const total = (order as any).lines!.length; // @ts-ignore`,
    good: `if (order.lines === undefined) throw new OrderWithoutLines(order.id);`,
  },
  scope: 'file',
  standalone: true,
  judge(file) {
    return [...untyped(file), ...asserted(file), ...silenced(file)];
  },
};

/** In a test, an untyped value cannot reach production: it advises instead of blocking. */
function untyped(file: SourceFile): Finding[] {
  return [...file.scan.code.matchAll(ANY)].map((match) => ({
    line: file.scan.lineAt(match.index),
    message: `The type any is used (${match[0].trim()}).`,
    fix: ANY_FIX,
    ...(file.isTest ? { severity: 'warn' } : {}),
  }));
}

function asserted(file: SourceFile): Finding[] {
  return [...file.scan.code.matchAll(NON_NULL)].map((match) => ({
    line: file.scan.lineAt(match.index),
    message: 'A non-null assertion (!) silences the compiler.',
    fix: NON_NULL_FIX,
  }));
}

function silenced(file: SourceFile): Finding[] {
  return commentLines(file).flatMap((comment) => {
    const problem = silencerProblem(comment.text);

    return problem === undefined ? [] : [{ line: comment.line, message: `${problem}.`, fix: SILENCER_FIX }];
  });
}

function silencerProblem(text: string): string | undefined {
  const match = SILENCER.exec(text);

  if (match === null) {
    return undefined;
  }

  if (match[1] === 'ignore' || match[1] === 'nocheck') {
    return `@ts-${match[1]} hides every diagnostic`;
  }

  const expectsError = match[1] === 'expect-error';
  const reason = (expectsError ? match[2] : match[4]) ?? '';
  const explained = expectsError ? reason.replace(/^[\s:-]+/, '').length > 0 : /--\s*\S/.test(reason);

  return explained ? undefined : `${expectsError ? '@ts-expect-error' : (match[3] ?? '')} gives no reason`;
}
