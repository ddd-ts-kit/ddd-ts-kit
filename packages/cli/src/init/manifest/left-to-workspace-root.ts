import type { Config } from '../../config';
import { pnpmWorkspaceOf } from '../../package-manager/pnpm-workspace-of';

/** The files of a project its pnpm workspace holds in its place: not written, not even with --force. */
export function leftToWorkspaceRoot(root: string, config: Config): string[] {
  return config.stack.packageManager === 'pnpm' && pnpmWorkspaceOf(root) !== undefined ? ['pnpm-workspace.yaml'] : [];
}
