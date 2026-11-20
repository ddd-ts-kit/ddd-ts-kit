import fs from 'node:fs';
import path from 'node:path';

const FILE = 'pnpm-workspace.yaml';

/** The pnpm workspace a project is a package of. */
export interface PnpmWorkspace {
  /** Its pnpm-workspace.yaml: the only one pnpm reads for the project. */
  readonly file: string;
  readonly text: string;
  /** The project, from the root of the workspace. */
  readonly folder: string;
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

      return lists(packagesOf(text), folder) ? { file, text, folder } : undefined;
    }

    if (path.dirname(directory) === directory) {
      return undefined;
    }
  }
}

/** The globs of `packages:`, written as a block or between brackets. */
function packagesOf(text: string): string[] {
  const inline = /^packages:[ \t]*\[(.*)\]/m.exec(text)?.[1];
  const block = /^packages:[ \t]*\n((?:[ \t]*-.*\n?|[ \t]*\n)*)/m.exec(text)?.[1] ?? '';

  const items =
    inline === undefined ? block.split('\n').map((line) => line.replace(/^[ \t]*-/, '')) : inline.split(',');

  return items
    .map((item) =>
      item
        .replace(/\s#.*$/, '')
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2'),
    )
    .filter(Boolean);
}

/** A glob that starts with `!` leaves out what the others list. */
function lists(globs: readonly string[], folder: string): boolean {
  const matches = (glob: string): boolean => patternOf(glob).test(folder);
  const left = globs.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1));

  return globs.some((glob) => !glob.startsWith('!') && matches(glob)) && !left.some(matches);
}

/** `*` stands for one folder, `**` for any depth. */
function patternOf(glob: string): RegExp {
  const source = glob
    .replace(/^\.\//, '')
    .replace(/\/$/, '')
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) => WILDCARDS[part] ?? part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('');

  return new RegExp(`^${source}$`);
}

const WILDCARDS: Record<string, string | undefined> = { '**/': '(?:.+/)?', '**': '.*', '*': '[^/]*' };
