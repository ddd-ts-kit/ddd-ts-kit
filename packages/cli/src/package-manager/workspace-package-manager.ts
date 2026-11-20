import fs from 'node:fs';
import path from 'node:path';
import { isOneOf, PACKAGE_MANAGERS, type Stack } from '../config';
import { isRecord } from '../config/values/is-record';
import { LOCKFILES } from './lockfiles';

/** The package manager of the workspace a project is a package of, and the file that said it. */
export interface WorkspacePackageManager {
  readonly manager: Stack['packageManager'];
  readonly from: string;
}

/**
 * The package manager of the nearest folder above the project that declares a workspace
 * (`workspaces` in its package.json, or a pnpm-workspace.yaml): the `packageManager` it pins, else
 * what its lockfile says. Only a workspace root is read, so a lockfile left higher up decides nothing;
 * undefined outside a workspace, or when it uses a manager the kit does not write for.
 */
export function workspacePackageManager(root: string): WorkspacePackageManager | undefined {
  for (let folder = path.dirname(path.resolve(root)); ; folder = path.dirname(folder)) {
    const manifest = readManifest(folder);
    const pnpmWorkspace = path.join(folder, 'pnpm-workspace.yaml');

    if (manifest?.['workspaces'] !== undefined || fs.existsSync(pnpmWorkspace)) {
      return managerOfWorkspace(folder, manifest);
    }

    if (path.dirname(folder) === folder) {
      return undefined;
    }
  }
}

function managerOfWorkspace(
  folder: string,
  manifest: Record<string, unknown> | undefined,
): WorkspacePackageManager | undefined {
  const pinned = manifest?.['packageManager'];

  if (typeof pinned === 'string') {
    const name = pinned.split('@')[0];

    return isOneOf(PACKAGE_MANAGERS, name) ? { manager: name, from: path.join(folder, 'package.json') } : undefined;
  }

  if (fs.existsSync(path.join(folder, 'pnpm-workspace.yaml'))) {
    return { manager: 'pnpm', from: path.join(folder, 'pnpm-workspace.yaml') };
  }

  return managerOfLockfile(folder);
}

/** The lockfiles of the managers the kit does not write for: their workspace keeps the default, said nowhere. */
const OTHER_LOCKFILES = ['yarn.lock', 'bun.lock', 'bun.lockb'];

/** What the lockfiles of a workspace that pins nothing say; npm, which reads `workspaces` itself, when it has none yet. */
function managerOfLockfile(folder: string): WorkspacePackageManager | undefined {
  if (OTHER_LOCKFILES.some((lockfile) => fs.existsSync(path.join(folder, lockfile)))) {
    return undefined;
  }

  const found = (['pnpm', 'npm'] as const).find((manager) => fs.existsSync(path.join(folder, LOCKFILES[manager])));

  return found === undefined
    ? { manager: 'npm', from: path.join(folder, 'package.json') }
    : { manager: found, from: path.join(folder, LOCKFILES[found]) };
}

function readManifest(folder: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));

    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
