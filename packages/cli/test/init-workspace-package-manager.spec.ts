import { describe, expect, it } from 'vitest';
import { cli, read, tempDir, write } from './helpers';

const FLAGS = ['--http', 'hono', '--orm', 'none', '--database', 'none', '--ci', 'none', '--audit', 'off'];

function managerOf(root: string): unknown {
  return JSON.parse(read(root, 'ddd-ts-kit.config.json')).stack.packageManager;
}

/** A workspace root with the files given, and the folder of a package in it where `init` runs. */
function workspace(files: Readonly<Record<string, string>>): { root: string; project: string } {
  const root = tempDir('workspace');

  for (const [file, content] of Object.entries(files)) {
    write(root, file, content);
  }

  return { root, project: `${root}/packages/api` };
}

describe('init in a package of a workspace', () => {
  it('takes the package manager the workspace pins, and says where it read it', () => {
    const { root, project } = workspace({
      'package.json': JSON.stringify({ workspaces: ['packages/*'], packageManager: 'npm@11.20.0' }),
    });

    const result = cli(project, 'init', ...FLAGS);

    expect(result.code).toBe(0);
    expect(managerOf(project)).toBe('npm');
    expect(result.stdout + result.stderr).toContain(`it uses npm, read from ${root}/package.json`);
  });

  it('reads pnpm from a pnpm-workspace.yaml when nothing is pinned', () => {
    const { project } = workspace({ 'package.json': '{}', 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n" });

    expect(cli(project, 'init', ...FLAGS).code).toBe(0);
    expect(managerOf(project)).toBe('pnpm');
  });

  it('reads the lockfile of an npm workspace that pins nothing', () => {
    const { project } = workspace({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'pnpm-lock.yaml': '',
    });

    expect(cli(project, 'init', ...FLAGS).code).toBe(0);
    expect(managerOf(project)).toBe('pnpm');
  });

  it('reads npm from a workspace that pins nothing and has no lockfile of pnpm', () => {
    const { project } = workspace({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }) });

    expect(cli(project, 'init', ...FLAGS).code).toBe(0);
    expect(managerOf(project)).toBe('npm');
  });

  it('keeps the default when the workspace pins a manager the kit does not write for', () => {
    const { project } = workspace({
      'package.json': JSON.stringify({ workspaces: ['packages/*'], packageManager: 'yarn@4.9.0' }),
    });

    expect(cli(project, 'init', ...FLAGS).code).toBe(0);
    expect(managerOf(project)).toBe('pnpm');
  });

  it('reads npm from the package-lock.json of a workspace that pins nothing, and says so', () => {
    const { root, project } = workspace({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'package-lock.json': '{}',
    });

    const result = cli(project, 'init', ...FLAGS);

    expect(managerOf(project)).toBe('npm');
    expect(result.stdout + result.stderr).toContain(`read from ${root}/package-lock.json`);
  });

  it.each(['yarn.lock', 'bun.lock'])(
    'keeps the default, with no note, in a workspace that %s says is not npm',
    (lockfile) => {
      const { project } = workspace({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }), [lockfile]: '' });

      const result = cli(project, 'init', ...FLAGS);

      expect(managerOf(project)).toBe('pnpm');
      expect(result.stdout + result.stderr).not.toContain('read from');
    },
  );

  it('lets --package-manager name another one, without the note', () => {
    const { project } = workspace({
      'package.json': JSON.stringify({ workspaces: ['packages/*'], packageManager: 'npm@11.20.0' }),
    });

    const result = cli(project, 'init', ...FLAGS, '--package-manager', 'pnpm');

    expect(managerOf(project)).toBe('pnpm');
    expect(result.stdout + result.stderr).not.toContain('read from');
  });

  it('reads no lockfile of a folder that declares no workspace', () => {
    const { project } = workspace({ 'package-lock.json': '{}' });

    expect(cli(project, 'init', ...FLAGS).code).toBe(0);
    expect(managerOf(project)).toBe('pnpm');
  });
});

describe('the Dockerfile of a package of a workspace', () => {
  const IMAGE = 'the image builds from there';

  it('is said to build from the root of an npm workspace, which holds the lockfile it copies', () => {
    const { root, project } = workspace({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }) });

    const result = cli(project, 'init', ...FLAGS);

    expect(result.stdout + result.stderr).toContain(
      `copies package-lock.json, which the workspace keeps at its root (${root}): ${IMAGE}, with \`docker build -f packages/api/Dockerfile .\``,
    );

    expect(result.stdout + result.stderr).toContain('`npm ci --workspace packages/api`');
  });

  it('reads the packages of a workspace declared as an object', () => {
    const { project } = workspace({ 'package.json': JSON.stringify({ workspaces: { packages: ['packages/*'] } }) });

    const result = cli(project, 'init', ...FLAGS);

    expect(result.stdout + result.stderr).toContain(IMAGE);
  });

  it.each([
    ['does not list the project', { workspaces: ['apps/*'] }],
    ['declares no list of packages', { workspaces: {} }],
  ])('is left alone under a workspace that %s: the project installs alone', (_, manifest) => {
    const { project } = workspace({ 'package.json': JSON.stringify(manifest) });

    const result = cli(project, 'init', ...FLAGS, '--package-manager', 'npm');

    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(IMAGE);
  });

  it('passes over a nearer folder that declares a workspace without the project, as npm does', () => {
    const { root, project } = workspace({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/package.json': JSON.stringify({ workspaces: ['libs/*'] }),
    });

    const result = cli(project, 'init', ...FLAGS, '--package-manager', 'npm');

    expect(result.stdout + result.stderr).toContain(`at its root (${root}): ${IMAGE}`);
  });

  it('is said again when --force rewrites the file', () => {
    const { project } = workspace({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }) });

    expect(cli(project, 'init', ...FLAGS).code).toBe(0);

    const forced = cli(project, 'init', ...FLAGS, '--force');

    expect(forced.stdout + forced.stderr).toContain(IMAGE);
  });

  it('is left alone outside a workspace, and when init runs again without rewriting it', () => {
    const { project } = workspace({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }) });
    const alone = tempDir('alone');

    expect(cli(alone, 'init', ...FLAGS, '--package-manager', 'npm').stdout).not.toContain(IMAGE);
    expect(cli(project, 'init', ...FLAGS).code).toBe(0);

    const again = cli(project, 'init', ...FLAGS);

    expect(again.stdout + again.stderr).not.toContain(IMAGE);
  });
});
