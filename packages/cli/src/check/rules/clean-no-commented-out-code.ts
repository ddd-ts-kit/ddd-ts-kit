import { commentLines } from '../comments/comment-lines';
import { looksLikeCode } from '../comments/looks-like-code';
import type { FileRule } from '../model/rule';

const FIX = 'Delete it: version control keeps the old version, and code that does not run misleads the reader.';

export const cleanNoCommentedOutCode: FileRule = {
  id: 'clean/no-commented-out-code',
  description: 'No code in comments, the samples of a JSDoc block aside. Version control remembers.',
  severity: 'error',
  doc: {
    why: 'Nobody dares to delete commented-out code: it looks important and is never run, compiled or tested. It rots while the code around it changes, and misleads the next reader. Version control keeps every past version without that cost.',
    bad: `// const total = lines.reduce((sum, line) => sum + line.amount, 0);`,
    good: `(nothing: the old version is in the history)`,
  },
  scope: 'file',
  standalone: true,
  judge(file) {
    // A JSDoc block documents: the code it shows, fenced, under `@example` or simply indented, is a sample.
    const code = commentLines(file).filter(
      (comment) => !comment.jsdoc && !comment.sample && looksLikeCode(comment.text),
    );

    // One report per run of consecutive lines: a commented-out block is one finding.
    return code
      .filter((comment, index) => comment.line !== (code[index - 1]?.line ?? -1) + 1)
      .map((comment) => ({
        line: comment.line,
        message: `The comment holds code: "${comment.text.trim().slice(0, 60)}".`,
        fix: FIX,
      }));
  },
};
