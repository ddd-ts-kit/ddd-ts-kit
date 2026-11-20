import path from 'node:path';
import type { Config } from '../config';
import { workspacePackageManager } from '../package-manager/workspace-package-manager';
import type { StackOptions } from './stack/stack-options';

/** The package manager a new project took from the workspace it is a package of, and where it was read. */
export function workspaceManagerNote(root: string, options: StackOptions, config: Config): string[] {
  const workspace = options.packageManager === undefined ? workspacePackageManager(root) : undefined;

  return workspace === undefined || workspace.manager !== config.stack.packageManager
    ? []
    : [
        `This project is a package of the workspace of ${path.dirname(workspace.from)}: it uses ${workspace.manager}, read from ${workspace.from}. Install from the root of the workspace; --package-manager names another one.`,
      ];
}
