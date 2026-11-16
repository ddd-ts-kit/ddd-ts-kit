import { CONFIG_FILE, type Config, parseConfig } from '../config';
import { importedTwiceNotes } from '../generate/kinds/same-name/imported-twice-notes';
import { indexExports } from '../generate/kinds/same-name/index-exports';
import { gitPath } from './git-path';
import type { MergeContext } from './merge-context';
import type { Settled } from './merge-report';
import type { Resolution } from './resolution';
import { asSettled } from './as-settled';
import { configOfTheMerge } from './config-of-the-merge';
import { Workspace } from '../workspace';
import { MergedTreeWorkspace } from './merged-tree-workspace';
import { sideIndex } from './side-index';
import { type MergedSides, tableNamesSettled } from './table-names-settled';
import { treeFiles } from './tree-files';
import { sideReader } from './side-reader';

/** The merge a dry run computed: its tree, the trunk it merges, and how each conflicted path would be settled. */
interface Previewed {
  readonly tree: string;
  readonly trunk: string;
  readonly resolutions: readonly Resolution[];
}

/**
 * What the merge would settle in the schema index, said by a dry run that writes nothing, on disk
 * or anywhere: the index as the merge would leave it and the sources of the contexts are read from
 * the tree the merge computed, and the names are settled in memory as the real run settles them. A
 * configuration both sides changed is read as a resolution keeping the contexts of both sides
 * would read it (`configOfTheMerge`). On TypeORM nothing is settled: the names the merged index
 * imports twice are said, as the real run says them. Whatever keeps the dry run from saying is
 * said only when the two sides give one name to two tables, and never changes how it exits.
 */
export function previewTableNames(context: MergeContext, previewed: Previewed): Settled[] {
  const { config, repo } = context;

  if (config === undefined || !['drizzle', 'typeorm'].includes(config.stack.orm)) {
    return [];
  }

  const index = `${config.platformDir}/database/schema.ts`;
  const where = { file: `${repo.prefix}${index}`, index };
  const sides = { onTrunk: sideReader(repo, previewed.trunk), onBranch: sideReader(repo, 'HEAD') };

  try {
    const ws = workspaceOf(context, { ...previewed, config, index });

    return config.stack.orm === 'typeorm'
      ? asSettled(importedTwiceNotes(ws, config), where)
      : asSettled(tableNamesSettled(ws, parseConfig(JSON.parse(ws.read(CONFIG_FILE) ?? '')), sides), where);
  } catch (error) {
    return notPreviewed(context, { config, sides, where, error });
  }
}

/** The tree of the merge, in memory: on Drizzle the sources of the contexts read at once, with the configuration of the merge. */
function workspaceOf(
  { repo }: MergeContext,
  { tree, trunk, resolutions, config, index }: Previewed & { config: Config; index: string },
): MergedTreeWorkspace {
  const isDrizzle = config.stack.orm === 'drizzle';
  const files = treeFiles(repo, { tree, preloaded: isDrizzle ? [config.contextsDir] : [] });
  const merged = resolutions.find(({ file }) => file === `${repo.prefix}${index}`)?.content ?? files.read(index) ?? '';

  // Each path the merge writes is read as it writes it, a path left to a person with the markers it is handed: what the settle reads.
  const settled = resolutions.flatMap(({ file, content }) =>
    content !== undefined && file.startsWith(repo.prefix) ? [[file.slice(repo.prefix.length), content] as const] : [],
  );

  // A configuration both sides changed is conflicted in the tree: the dry run reads it as a resolution keeping both sides' contexts would.
  const given = new Map<string, string | null>([
    [CONFIG_FILE, configOfTheMerge(repo, { tree, trunk })],
    ...settled,
    [index, merged],
  ]);

  if (!isDrizzle) {
    given.delete(CONFIG_FILE);
  }

  return new MergedTreeWorkspace(gitPath(repo.top, 'ddd-ts-kit-dry-run'), files, given);
}

/** What a dry run that cannot say what the merge would settle says: nothing, unless the two sides give one name to two tables. */
function notPreviewed(
  { repo }: MergeContext,
  {
    config,
    sides,
    where,
    error,
  }: { config: Config; sides: MergedSides; where: { file: string; index: string }; error: unknown },
): Settled[] {
  try {
    // A workspace that holds nothing: each side is read from its commit.
    const ws = new Workspace(gitPath(repo.top, 'ddd-ts-kit-dry-run'), false);

    const ofTrunk = indexExports(sideIndex(ws, config, sides.onTrunk));
    const ofBranch = indexExports(sideIndex(ws, config, sides.onBranch));

    const isShared = [...ofTrunk].some(([name, bound]) => {
      const other = ofBranch.get(name);

      return other?.value !== undefined && bound.value !== undefined && other.value !== bound.value;
    });

    const message = error instanceof Error ? error.message : String(error);

    return isShared
      ? [
          {
            file: where.file,
            kind: 'registry',
            how: `what the merge would settle in it could not be previewed (${message})`,
          },
        ]
      : [];
  } catch {
    /* v8 ignore next -- ADR-0001: the two sides are read through git by readers that answer nothing rather than throw: what is left is a fault of the kit */
    return [];
  }
}
