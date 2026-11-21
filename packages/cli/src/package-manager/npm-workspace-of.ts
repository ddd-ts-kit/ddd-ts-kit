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
 * lists the project in its `workspaces`. As npm does, a folder that declares a workspace without
 * the project is passed over. Undefined when none lists it: the project then installs alone, with
 * a lockfile of its own.
 */
export function npmWorkspaceOf(root: string): NpmWorkspace | undefined {
  const project = path.resolve(root);

  for (let directory = path.dirname(project); ; directory = path.dirname(directory)) {
    const folder = path.relative(directory, project).split(path.sep).join('/');

    if (listedBy(workspacesOf(directory), folder)) {
      return { root: directory, folder };
    }

    if (path.dirname(directory) === directory) {
      return undefined;
    }
  }
}

/** The globs of `workspaces`, a list or the `packages` of an object; none when the folder declares none. */
function workspacesOf(directory: string): string[] {
  try {
    const manifest: unknown = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const declared = isRecord(manifest) ? manifest['workspaces'] : undefined;
    const globs = isRecord(declared) ? declared['packages'] : declared;

    return Array.isArray(globs) ? globs.filter((glob): glob is string => typeof glob === 'string') : [];
  } catch {
    return [];
  }
}
