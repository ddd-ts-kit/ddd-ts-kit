import { gitProcess } from '../git-process';
import { objectBytes } from '../object-bytes';

/** The three versions of one declaration, as lines. */
export interface Versions {
  readonly ours: readonly string[];
  readonly base: readonly string[];
  readonly theirs: readonly string[];
}

const FILE = 'declaration';
const AUTHOR = ['-c', 'user.name=ddd-ts-kit', '-c', 'user.email=ddd-ts-kit@localhost', '-c', 'commit.gpgsign=false'];
const OBJECT = /^[0-9a-f]{40,64}$/;

/**
 * The file three versions of a declaration merge into, as lines, by the `git merge-tree` that
 * computes the merge of the tree: each version is written as an object of the repository, no ref
 * names it. With `hunks`, each conflict is written as diff3 markers, as merge-trunk reads those of
 * a file. Undefined on a conflict when no hunk is asked for, or when git cannot write or merge the
 * versions (a git without `--merge-base`).
 */
export function mergedFile(top: string, versions: Versions, hunks: boolean): string[] | undefined {
  const commits = commitsOf(top, versions);

  if (commits === undefined) {
    return undefined;
  }

  const merge = [
    'merge-tree',
    '--write-tree',
    '--no-messages',
    `--merge-base=${commits.base}`,
    commits.ours,
    commits.theirs,
  ];

  const answer = gitProcess(top, hunks ? ['-c', 'merge.conflictStyle=diff3', ...merge] : merge);
  const [tree = ''] = answer.stdout.split('\n');
  const name = `${tree}:${FILE}`;
  const merged = (answer.status === 0 || (hunks && answer.status === 1)) && OBJECT.test(tree);

  return merged ? objectBytes(top, [name]).get(name)?.toString('utf8').replace(/\n$/, '').split('\n') : undefined;
}

/** A commit for each version, ours and theirs on the base; undefined when git does not write one. */
function commitsOf(top: string, { ours, base, theirs }: Versions): Record<keyof Versions, string> | undefined {
  const origin = commitOf(top, base);
  const mine = origin === undefined ? undefined : commitOf(top, ours, origin);
  const other = origin === undefined ? undefined : commitOf(top, theirs, origin);

  return origin === undefined || mine === undefined || other === undefined
    ? undefined
    : { base: origin, ours: mine, theirs: other };
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

  return OBJECT.test(id) ? id : undefined;
}
