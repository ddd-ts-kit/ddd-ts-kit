import type { SourceFile } from '../model/source-file';
import type { CommentRecord } from '../scan/comment-record';

const DIRECTIVE = 'ddd-ts-kit-disable-next-line';
const DIRECTIVE_END = /^(?:\W|$)/;
const LINE_BREAK = /[\n\r\u2028\u2029]/;

export interface Suppression {
  readonly file: string;
  /** Line of the directive. */
  readonly line: number;
  /** The rules it silences, as written: `<rule-id>, <rule-id>`. */
  readonly ruleIds: readonly string[];
  readonly reason: string;
  /**
   * The lines it silences its rules on: the line after the directives it stands among, one above
   * the other. Those that open a file also cover line 1, where a finding about the whole file
   * (a name, a missing spec) is reported.
   */
  readonly covers: readonly number[];
}

export function findSuppressions(file: SourceFile): Suppression[] {
  return stacksOf(file.scan.comments.flatMap(directiveOf)).flatMap((stack) => {
    const after = (stack.at(-1)?.line ?? 0) + 1;
    const covers = stack[0]?.line === 1 ? [1, after] : [after];

    return stack.map((directive) => ({ file: file.path, ...directive, covers }));
  });
}

type Directive = Pick<Suppression, 'line' | 'ruleIds' | 'reason'>;

function directiveOf(comment: CommentRecord): Directive[] {
  const written = directiveText(comment.text);

  if (written === undefined || !comment.ownLine) {
    return [];
  }

  const [head = '', ...reason] = written.split('--');

  const ruleIds = head
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');

  return [{ line: comment.line, ruleIds, reason: reason.join('--').trim() }];
}

/** What follows the directive on its line; undefined when the comment is not one, or runs over several lines. */
function directiveText(comment: string): string | undefined {
  if (!comment.startsWith(DIRECTIVE)) {
    return undefined;
  }

  const after = comment.slice(DIRECTIVE.length);
  const written = after.trimStart();

  return DIRECTIVE_END.test(after) && !LINE_BREAK.test(written) ? written : undefined;
}

/** The directives of a file grouped as they stand, each group on consecutive lines. */
function stacksOf(directives: readonly Directive[]): Directive[][] {
  const stacks: Directive[][] = [];

  for (const directive of directives) {
    const open = stacks.at(-1);

    if (open !== undefined && open.at(-1)?.line === directive.line - 1) {
      open.push(directive);
    } else {
      stacks.push([directive]);
    }
  }

  return stacks;
}
