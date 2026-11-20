import path from 'node:path';
import { pnpmWorkspaceOf } from './pnpm-workspace-of';

/** The file pnpm reads the settings of a project in: the one of its workspace, else its own. */
export function pnpmSettingsFile(root: string): string {
  return pnpmWorkspaceOf(root)?.file ?? path.join(root, 'pnpm-workspace.yaml');
}
