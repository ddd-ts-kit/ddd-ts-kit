import { Workspace } from '../workspace';
import { LINKED, LINKED_AWAY } from '../generate/kinds/same-name/linked';
import type { TreeFiles } from './tree-files';

/**
 * A workspace of the tree a dry run computed, which writes nothing anywhere: what a settle writes
 * stays in it, and any other file is read from `given`, what the merge itself settles each path
 * to (null for a path it takes out), or else from the tree. Its root holds nothing on disk.
 */
export class MergedTreeWorkspace extends Workspace {
  constructor(
    root: string,
    private readonly tree: TreeFiles,
    private readonly given: ReadonlyMap<string, string | null>,
  ) {
    super(root, false);
  }

  override read(asked: string): string | undefined {
    const target = this.given.has(asked) ? undefined : this.tree.linkOf(asked);

    if (target === undefined) {
      return this.plain(asked);
    }

    // A link of the tree is no text the kit reads: the text it points at follows `LINKED`, as the merge writes it, for a word to be found in.
    const text = target === null || this.tree.linkOf(target) !== undefined ? undefined : this.plain(target);

    return text === undefined ? LINKED_AWAY : `${LINKED}${text}`;
  }

  override existsAsIs(file: string): boolean {
    return super.existsAsIs(file) || this.isInTree(file);
  }

  /** A file as this command writes it, as the merge settles it (null for none), or as the tree holds it. */
  private plain(asked: string): string | undefined {
    const given = this.given.get(asked);

    return super.read(asked) ?? (this.given.has(asked) ? (given ?? undefined) : this.tree.read(asked));
  }

  /** Whether the tree, or what is given, holds a file or a folder at this path. */
  private isInTree(held: string): boolean {
    const given = this.given.get(held);

    return this.given.has(held)
      ? given !== null
      : this.tree.paths.some((file) => file === held || file.startsWith(`${held}/`));
  }
}
