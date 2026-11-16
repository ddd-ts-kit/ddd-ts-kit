import { gitProcess } from '../git-process';
import { objectBytes } from '../object-bytes';

/** The three versions of one declaration, as lines. */
export interface Versions {
  readonly ours: readonly string[];
  readonly base: readonly string[];
  readonly theirs: readonly string[];
}

/** What merges the lines of the three versions of a declaration; undefined when they do not merge without a conflict. */
export type LineMerge = (versions: Versions) => readonly string[] | undefined;

const FILE = 'declaration';
const AUTHOR = ['-c', 'user.name=ddd-ts-kit', '-c', 'user.email=ddd-ts-kit@localhost', '-c', 'commit.gpgsign=false'];

/**
 * The lines of a declaration both sides changed, merged as git merges a file: each version is
 * written as an object of the repository, no ref names it, and the merge is computed as
 * merge-trunk computes the one of the tree. Undefined when the versions conflict, or when git cannot write or merge
 * them: the declaration is then left to a person.
 */
export function mergedLines(top: string, { ours, base, theirs }: Versions): string[] | undefined {
  const origin = commitOf(top, base);
  const mine = origin === undefined ? undefined : commitOf(top, ours, origin);
  const other = origin === undefined ? undefined : commitOf(top, theirs, origin);

  return origin === undefined || mine === undefined || other === undefined
    ? undefined
    : mergedFile(top, { base: origin, ours: mine, theirs: other });
}

/**
 * The file three commits merge into, as lines, by the `git merge-tree` that computes the merge of
 * the tree; undefined on a conflict, or when git does not merge them (a git without `--merge-base`).
 */
function mergedFile(
  top: string,
  { base, ours, theirs }: Record<'base' | 'ours' | 'theirs', string>,
): string[] | undefined {
  const tree = written(top, ['merge-tree', '--write-tree', '--no-messages', `--merge-base=${base}`, ours, theirs]);
  const name = `${tree ?? ''}:${FILE}`;
  const text = tree === undefined ? undefined : objectBytes(top, [name]).get(name)?.toString('utf8');

  return text?.replace(/\n$/, '').split('\n');
}

/** A commit that holds the lines as one file, on `parent` when it has one; undefined when git does not write it. */
function commitOf(top: string, lines: readonly string[], parent?: string): string | undefined {
  const blob = written(top, ['hash-object', '-w', '--stdin'], `${lines.join('\n')}\n`);
  const tree = blob === undefined ? undefined : written(top, ['mktree'], `100644 blob ${blob}\t${FILE}\n`);

  return tree === undefined
    ? undefined
    : written(top, [...AUTHOR, 'commit-tree', tree, ...(parent === undefined ? [] : ['-p', parent]), '-m', FILE]);
}

/** The object git wrote, by its id. */
function written(top: string, args: readonly string[], input?: string): string | undefined {
  const answer = gitProcess(top, args, input);
  const id = answer.status === 0 ? answer.stdout.trim() : '';

  return /^[0-9a-f]{40,64}$/.test(id) ? id : undefined;
}
