import fs from 'node:fs';
import path from 'node:path';
import { pnpmWorkspaceOf } from './pnpm-workspace-of';

/**
 * The file pnpm reads the settings of a project in: its own when it has one, the nearest for
 * pnpm, else the one of the workspace that lists it.
 */
export function pnpmSettingsFile(root: string): string {
  const own = path.join(root, 'pnpm-workspace.yaml');

  return fs.existsSync(own) ? own : (pnpmWorkspaceOf(root)?.file ?? own);
}
