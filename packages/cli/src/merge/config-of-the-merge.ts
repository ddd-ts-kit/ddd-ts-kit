import { CONFIG_FILE } from '../config';
import type { MergeContext } from './merge-context';
import { trunkReader } from './trunk-reader';

/**
 * The configuration a dry run reads the merge with, as text: the one of the merged tree when it is
 * one, else, both sides having changed it (a version, a context each), the branch's with the
 * contexts of both sides, as a resolution keeping the contexts of both sides would read it, else the
 * branch's.
 */
export function configOfTheMerge(repo: MergeContext['repo'], { tree, trunk }: { tree: string; trunk: string }): string {
  const inTree = trunkReader(repo, tree)(CONFIG_FILE);
  const ofBranch = trunkReader(repo, 'HEAD')(CONFIG_FILE) ?? '';

  if (objectOf(inTree) !== undefined) {
    return inTree ?? '';
  }

  const branch = objectOf(ofBranch);
  const ofTrunk = objectOf(trunkReader(repo, trunk)(CONFIG_FILE));

  if (branch === undefined || ofTrunk === undefined) {
    return ofBranch;
  }

  return `${JSON.stringify({ ...branch, contexts: { ...contextsOf(ofTrunk), ...contextsOf(branch) } }, null, 2)}\n`;
}

function objectOf(text: string | undefined): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text ?? '');

    return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : undefined;
  } catch {
    return undefined;
  }
}

function contextsOf(config: Record<string, unknown>): Record<string, unknown> {
  const contexts = config['contexts'];

  return typeof contexts === 'object' && contexts !== null ? { ...contexts } : {};
}
