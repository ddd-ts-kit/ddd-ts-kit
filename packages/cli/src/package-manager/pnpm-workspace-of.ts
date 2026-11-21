import fs from 'node:fs';
import path from 'node:path';
import { listedBy } from './listed-by';

const FILE = 'pnpm-workspace.yaml';

/** The pnpm workspace a project is a package of. */
export interface PnpmWorkspace {
  /** Its pnpm-workspace.yaml: the only one pnpm reads for the project. */
  readonly file: string;
  readonly text: string;
  /** The project, from the root of the workspace. */
  readonly folder: string;
  /** Whether the workspace lists a folder, named from its root, among its packages. */
  readonly lists: (folder: string) => boolean;
}

/**
 * The pnpm workspace above a project that lists it among its packages: pnpm takes the nearest
 * pnpm-workspace.yaml as the root of a workspace, so a file of its own would cut the project out
 * of the one it belongs to. Undefined when the nearest file above does not list the project, which
 * then installs alone and keeps its own file.
 */
export function pnpmWorkspaceOf(root: string): PnpmWorkspace | undefined {
  const project = path.resolve(root);

  for (let directory = path.dirname(project); ; directory = path.dirname(directory)) {
    const file = path.join(directory, FILE);

    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf8');
      const folder = path.relative(directory, project).split(path.sep).join('/');

      const lists = (named: string): boolean => listedBy(packagesOf(text), named);

      return lists(folder) ? { file, text, folder, lists } : undefined;
    }

    if (path.dirname(directory) === directory) {
      return undefined;
    }
  }
}

/**
 * The globs of `packages:`, as a block or between brackets, on one line or several. The file is
 * read without a YAML parser: comments and empty lines are left out, and the list ends at the
 * next key.
 */
function packagesOf(text: string): string[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !/^\s*(#.*)?$/.test(line));

  const at = lines.findIndex((line) => line.startsWith('packages:'));
  const rest = at === -1 ? [] : lines.slice(at + 1);
  const end = rest.findIndex((line) => /^[^\s\-\]]/.test(line));
  const list = [(lines[at] ?? '').replace(/^packages:/, ''), ...(end === -1 ? rest : rest.slice(0, end))];

  return list
    .join('\n')
    .split(/\n|,(?![^{]*\})/)
    .map((item) =>
      item
        .replace(/\s#.*$/, '')
        .replace(/^[\s\-[]+|[\s\]]+$/g, '')
        .replace(/^(['"])(.*)\1$/, '$2'),
    )
    .filter(Boolean);
}
