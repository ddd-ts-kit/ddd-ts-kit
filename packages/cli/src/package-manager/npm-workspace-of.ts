import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../config/values/is-record';
import { listedBy } from './listed-by';

/** The npm workspace a project is a package of. */
export interface NpmWorkspace {
  /** The folder whose package.json declares the workspace, and that holds its lockfile. */
  readonly root: string;
  /** The project, from the root of the workspace. */
  readonly folder: string;
}

/**
 * The npm workspace above a project that lists it: the nearest folder above whose package.json
 * declares `workspaces`, when they list the project. Undefined when they do not: the project then
 * installs alone, with a lockfile of its own.
 */
export function npmWorkspaceOf(root: string): NpmWorkspace | undefined {
  const project = path.resolve(root);

  for (let directory = path.dirname(project); ; directory = path.dirname(directory)) {
    const globs = workspacesOf(directory);

    if (globs !== undefined) {
      const folder = path.relative(directory, project).split(path.sep).join('/');

      return listedBy(globs, folder) ? { root: directory, folder } : undefined;
    }

    if (path.dirname(directory) === directory) {
      return undefined;
    }
  }
}

/** The globs of `workspaces`, a list or the `packages` of an object; undefined when the folder declares none. */
function workspacesOf(directory: string): string[] | undefined {
  try {
    const manifest: unknown = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const declared = isRecord(manifest) ? manifest['workspaces'] : undefined;
    const globs = isRecord(declared) ? declared['packages'] : declared;

    if (declared === undefined) {
      return undefined;
    }

    return Array.isArray(globs) ? globs.filter((glob): glob is string => typeof glob === 'string') : [];
  } catch {
    return undefined;
  }
}
