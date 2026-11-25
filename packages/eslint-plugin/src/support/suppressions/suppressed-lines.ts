import { AST_TOKEN_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { sharesLineWithCode } from './shares-line-with-code';

const DIRECTIVE = /^ddd-ts-kit-disable-next-line(?:\W|$)/;
const NAMED_WITH_A_REASON = /^ddd-ts-kit-disable-next-line\s+(.*?)\s*--\s*\S/;

/**
 * Lines silenced for `ruleId` by the suppression comment the CLI checker understands too: a comment
 * on its own line that names the rule, alone or in a list after commas, and gives a reason. Directives
 * one above the other all cover the line after the last of them.
 */
export function suppressedLines(sourceCode: Readonly<TSESLint.SourceCode>, ruleId: string): ReadonlySet<number> {
  const directives = sourceCode
    .getAllComments()
    .filter((comment) => isDirective(comment) && !sharesLineWithCode(sourceCode, comment));

  return new Set(
    directives.flatMap((comment, index) => (silences(comment, ruleId) ? [lineAfterStack(directives, index)] : [])),
  );
}

function isDirective(comment: TSESTree.Comment): boolean {
  return comment.type === AST_TOKEN_TYPES.Line && DIRECTIVE.test(comment.value.trim());
}

function silences(comment: TSESTree.Comment, ruleId: string): boolean {
  const named = NAMED_WITH_A_REASON.exec(comment.value.trim())?.[1] ?? '';

  return named
    .split(',')
    .map((id) => id.trim())
    .includes(ruleId);
}

function lineAfterStack(directives: readonly TSESTree.Comment[], from: number): number {
  let last = from;

  while (directives[last + 1]?.loc.start.line === lineOf(directives[last]) + 1) {
    last += 1;
  }

  return lineOf(directives[last]) + 1;
}

function lineOf(comment: TSESTree.Comment | undefined): number {
  return comment?.loc.end.line ?? 0;
}
