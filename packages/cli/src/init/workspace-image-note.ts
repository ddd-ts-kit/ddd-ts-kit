import path from 'node:path';
import type { Config } from '../config';
import { LOCKFILES } from '../package-manager/lockfiles';
import { npmWorkspaceOf } from '../package-manager/npm-workspace-of';
import { pnpmWorkspaceOf } from '../package-manager/pnpm-workspace-of';

/** Where a workspace stands and where the project is in it. */
interface Above {
  readonly root: string;
  readonly folder: string;
}

/**
 * The Dockerfile `init` writes copies the manifest and the lockfile of its folder. A package of a
 * workspace has no lockfile: the root holds it. Nothing else is written for it, since the image of
 * one package depends on what the workspace shares; the note says where the image builds and what
 * to change in the file.
 */
export function workspaceImageNote(root: string, config: Config): string[] {
  const manager = config.stack.packageManager;
  const above = workspaceAbove(root, manager);

  if (above === undefined) {
    return [];
  }

  const { folder } = above;
  const lockfile = LOCKFILES[manager];

  const [copied, install, build] =
    manager === 'pnpm'
      ? [
          `package.json, ${lockfile} and pnpm-workspace.yaml`,
          `pnpm install --frozen-lockfile --filter ./${folder}...`,
          `pnpm --filter ./${folder} run build`,
        ]
      : [`package.json and ${lockfile}`, `npm ci --workspace ${folder}`, `npm run build --workspace ${folder}`];

  return [
    `The Dockerfile of this folder copies ${lockfile}, which the workspace keeps at its root (${above.root}): the image builds from there, with \`docker build -f ${folder}/Dockerfile .\`. In the Dockerfile, copy ${copied} of the root and ${folder}/package.json before the install, install and build this package alone (\`${install}\`, \`${build}\`), and keep the same folders in the last stage: node_modules of the root, then dist, package.json and the node_modules of the package under ${folder}, where node starts. A package of the workspace this one depends on is copied and built the same way.`,
  ];
}

function workspaceAbove(root: string, manager: Config['stack']['packageManager']): Above | undefined {
  if (manager === 'npm') {
    return npmWorkspaceOf(root);
  }

  const workspace = pnpmWorkspaceOf(root);

  return workspace === undefined ? undefined : { root: path.dirname(workspace.file), folder: workspace.folder };
}
