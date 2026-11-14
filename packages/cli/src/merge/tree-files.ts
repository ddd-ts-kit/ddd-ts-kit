import { posix } from 'node:path';
import type { FileReader } from '../generate/kinds/same-name/sources-of';
import { gitProcess } from './git-process';
import { LINKED, LINKED_AWAY } from '../generate/kinds/same-name/linked';
import { objectBytes } from './object-bytes';
import type { MergeContext } from './merge-context';
import { trunkReader } from './trunk-reader';

/** The files of a tree of the repository, from the project root: their paths, and how to read one. */
export interface TreeFiles {
  readonly paths: readonly string[];
  /** A file of the tree; one that is a symbolic link, or that a folder of its path that is one leads to, reads as `LINKED`. */
  readonly read: FileReader;
  /** Where a symbolic link of the tree points in the project, null outside it; undefined for a file that is no link. */
  readonly linkOf: (file: string) => string | null | undefined;
}

/** One blob of `git ls-tree`: its mode, its object and its path from the project root. */
interface Entry {
  readonly mode: string;
  readonly object: string;
  readonly path: string;
}

/**
 * The files of a tree, read without writing anything: every path in one `git ls-tree`, the files
 * under `preloaded` in one `git cat-file --batch`, any other file when it is first read, once. A
 * symbolic link reads as `LINKED`: the kit does not follow it, and keeps the text it points at in
 * the project only for a word to be found in.
 */
export function treeFiles(
  repo: MergeContext['repo'],
  { tree, preloaded }: { tree: string; preloaded: readonly string[] },
): TreeFiles {
  const { top, prefix } = repo;
  const listed = gitProcess(top, ['ls-tree', '-r', '-z', tree, '--', prefix === '' ? '.' : prefix]);
  const entries = listed.stdout.split('\0').flatMap((line) => entryOf(line, prefix));

  const links = linksOf(
    repo,
    entries.filter(({ mode }) => mode === LINK),
  );

  const wanted = entries.filter(
    ({ mode, path }) => mode !== LINK && preloaded.some((directory) => path.startsWith(`${directory}/`)),
  );

  const texts = batched(
    top,
    wanted.map(({ object }) => object),
  );

  const held = new Map(wanted.map(({ path }, at) => [path, texts[at]]));
  const fallback = trunkReader(repo, tree);

  const plain = (file: string): string | undefined => {
    if (!held.has(file)) {
      held.set(file, fallback(file));
    }

    return held.get(file);
  };

  const linkOf = (file: string): string | null | undefined => links.get(file);

  return { paths: entries.map(({ path }) => path), read: linkedReader(links, plain), linkOf };
}

/** The mode git gives a symbolic link. */
const LINK = '120000';

/**
 * A reader of the tree in which a symbolic link is no text of the project: a link to a file of the
 * project reads as `LINKED` followed by the text it points at, for a word to be found in, never
 * read; any other link, and a file a folder of its path that is a link leads to, as `LINKED_AWAY`.
 */
function linkedReader(links: ReadonlyMap<string, string | null>, plain: FileReader): FileReader {
  const isUnderLink = (file: string): boolean => ancestorsOf(file).some((folder) => links.has(folder));

  return (file) => {
    const target = links.get(file);

    if (isUnderLink(file)) {
      return LINKED_AWAY;
    }

    if (target === undefined) {
      return plain(file);
    }

    const text = target === null || links.has(target) || isUnderLink(target) ? undefined : plain(target);

    return text === undefined ? LINKED_AWAY : `${LINKED}${text}`;
  };
}

/** The folders a path of the project crosses, from its root down, the path itself left out. */
function ancestorsOf(file: string): string[] {
  const parts = file.split('/').slice(0, -1);

  return parts.map((_part, at) => parts.slice(0, at + 1).join('/'));
}

/** Where each symbolic link points in the project, from its root, or null when it points outside the project. */
function linksOf(repo: MergeContext['repo'], links: readonly Entry[]): Map<string, string | null> {
  const targets = batched(
    repo.top,
    links.map(({ object }) => object),
  );

  return new Map(
    links.map(({ path }, at) => [path, inProject(repo, { link: path, target: targets[at] ?? '' }) ?? null]),
  );
}

/** The path a link's target names in the project: against the folder of the link, or, written absolute, against the repository. */
function inProject(
  { top, prefix }: MergeContext['repo'],
  { link, target }: { link: string; target: string },
): string | undefined {
  const inRepository = posix.normalize(
    posix.isAbsolute(target) ? posix.relative(top, target) : posix.join(prefix, posix.dirname(link), target),
  );

  return inRepository.startsWith('..') || posix.isAbsolute(inRepository) || !inRepository.startsWith(prefix)
    ? undefined
    : inRepository.slice(prefix.length);
}

/** One blob of `git ls-tree`, its path after the first tab: a path may hold a tab of its own. */
function entryOf(line: string, prefix: string): Entry[] {
  const tab = line.indexOf('\t');
  const [mode = '', type, object = ''] = line.slice(0, Math.max(tab, 0)).split(' ');
  const path = line.slice(tab + 1);

  return tab >= 0 && type === 'blob' && path.startsWith(prefix)
    ? [{ mode, object, path: path.slice(prefix.length) }]
    : [];
}

/**
 * The text of each object, read as bytes in one `git cat-file --batch` and cut by the sizes git
 * gives, then decoded one file at a time: a byte of a file that is no UTF-8 is replaced in that
 * file alone, and shifts no other file.
 */
function batched(top: string, objects: readonly string[]): (string | undefined)[] {
  const bytes = objectBytes(top, objects);

  return objects.map((object) => bytes.get(object)?.toString('utf8'));
}
