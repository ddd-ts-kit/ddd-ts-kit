import path from 'node:path';
import type { Config } from '../../config';
import { pnpmWorkspaceOf } from '../../package-manager/pnpm-workspace-of';
import type { Workspace } from '../../workspace';
import { allowBuildsBlock } from './allow-builds-block';
import { allowBuildsEntries } from './allow-builds-entries';
import { installScriptsOf } from './install-scripts-of';
import { namesPackage } from './names-package';
import { overridesFor } from './overrides-for';
import { writeInstallScripts } from './write-install-scripts';
import { writeOverrides } from './write-overrides';

const PNPM_WORKSPACE = 'pnpm-workspace.yaml';

/**
 * The overrides and the install scripts of the stack, written where its package manager reads
 * them. A package of a pnpm workspace is the exception: pnpm reads the pnpm-workspace.yaml of
 * the workspace root alone, which is outside the project, so what that file lacks is said and
 * nothing is written.
 */
export function writeInstallSettings(ws: Workspace, config: Config, force: boolean): void {
  const workspace = config.stack.packageManager === 'pnpm' ? pnpmWorkspaceOf(ws.root) : undefined;

  if (workspace === undefined) {
    // After the files: under pnpm the overrides join the pnpm-workspace.yaml just written.
    writeOverrides(ws, config, force);
    writeInstallScripts(ws, config);

    return;
  }

  const lacking = lackingIn(workspace.text, config);

  const own = ws.exists(PNPM_WORKSPACE)
    ? ` Remove the ${PNPM_WORKSPACE} of this folder once the root one holds its settings: it makes the folder a workspace of its own, with its own lockfile.`
    : '';

  ws.note(
    `This project is a package of the pnpm workspace of ${path.dirname(workspace.file)}: pnpm reads the settings of ${workspace.file} alone, so no ${PNPM_WORKSPACE} is written here. ${
      lacking.length === 0
        ? 'That file holds what the stack needs.'
        : `Add to that file what the stack needs: ${lacking.join('; ')}.`
    }${own}`,
  );
}

/** What the file of the root lacks of what `init` writes in the one of a project that stands alone. */
function lackingIn(text: string, config: Config): string[] {
  const allowed = allowBuildsEntries(allowBuildsBlock(text) ?? '');
  const forced = (name: string): boolean => new RegExp(`^\\s+['"]?${name}['"]?:`, 'm').test(text);

  return [
    ...(/^strictDepBuilds:/m.test(text)
      ? []
      : [
          '`strictDepBuilds: false`, without which pnpm refuses to install while a build script is neither allowed nor refused',
        ]),
    ...Object.entries(overridesFor(config))
      .filter(([name]) => !forced(name))
      .map(
        ([name, range]) =>
          `under \`overrides:\`, \`${name}: '${range}'\`, which closes a vulnerability the stack still installs`,
      ),
    ...installScriptsOf(config.stack)
      .filter(({ name }) => !allowed.some(({ key }) => namesPackage(key, name)))
      .map(({ name, does }) => `under \`allowBuilds:\`, \`'${name}': true\` (its script ${does})`),
  ];
}
