import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pnpmSettingsFile } from '../src/package-manager/pnpm-settings-file';
import { cli, read, tempDir, write } from './helpers';

const FLAGS = ['--orm', 'prisma', '--ci', 'none'];
const OWN_FILE = 'pnpm-workspace.yaml';

/** A pnpm workspace whose file is the text given, and the folder of a project in it where `init` runs. */
function workspace(settings: string, folder = 'packages/api'): { root: string; project: string } {
  const root = tempDir('pnpm-workspace');

  write(root, 'package.json', '{}');
  write(root, OWN_FILE, settings);

  return { root, project: `${root}/${folder}` };
}

function notesOf(project: string, ...flags: readonly string[]): string {
  const result = cli(project, 'init', ...FLAGS, ...flags);

  expect(result.code).toBe(0);

  return result.stdout + result.stderr;
}

describe('init in a package of a pnpm workspace', () => {
  it('writes no pnpm-workspace.yaml, which would make the package a workspace apart, and says what the root one lacks', () => {
    const { root, project } = workspace("packages:\n  - 'packages/*'\n");

    const notes = notesOf(project);

    expect(fs.existsSync(path.join(project, OWN_FILE))).toBe(false);
    expect(read(root, OWN_FILE)).toBe("packages:\n  - 'packages/*'\n");
    expect(notes).toContain(`pnpm reads the settings of ${root}/${OWN_FILE} alone, so no ${OWN_FILE} is written here`);
    expect(notes).toContain('Add to that file what the stack needs: `strictDepBuilds: false`');
    expect(notes).toContain("under `overrides:`, `qs: '^6.16.0'`");
    expect(notes).toContain("under `allowBuilds:`, `'@prisma/engines': true`");
    expect(notes).not.toContain('Remove the');
  });

  it('asks for nothing the root file holds already', () => {
    const { project } = workspace(
      "packages:\n  - 'packages/*'\nstrictDepBuilds: false\noverrides:\n  qs: '^6.16.0'\nallowBuilds:\n  '@prisma/engines@7.10.1': true\n",
    );

    expect(notesOf(project)).toContain('That file holds what the stack needs.');
  });

  it('says to remove the file an earlier init left in the package, and does not rewrite it', () => {
    const { project } = workspace("packages:\n  - 'packages/*'\n");

    write(project, OWN_FILE, 'strictDepBuilds: false\n');

    expect(notesOf(project, '--force')).toContain(`Remove the ${OWN_FILE} of this folder`);
    expect(read(project, OWN_FILE)).toBe('strictDepBuilds: false\n');
  });

  it.each([
    ['a glob of one folder', "packages:\n  - 'packages/*'\n", 'packages/api'],
    ['a folder by its name, with a comment', 'packages:\n  - shop # the API\n', 'shop'],
    ['a glob of any depth', 'packages:\n  - "apps/**"\n', 'apps/back/api'],
    ['a glob of any depth before a name', "packages:\n  - './**/api/'\n", 'apps/back/api'],
    ['globs between brackets', "packages: ['tools/*', 'packages/*']\n", 'packages/api'],
  ])('reads the project as a package of the workspace: %s', (_, settings, folder) => {
    const { root, project } = workspace(settings, folder);

    notesOf(project, '--package-manager', 'pnpm');

    expect(fs.existsSync(path.join(project, OWN_FILE))).toBe(false);
    expect(pnpmSettingsFile(project)).toBe(`${root}/${OWN_FILE}`);
  });

  it.each([
    ['lists other folders', "packages:\n  - 'tools/*'\n"],
    ['leaves the folder out', "packages:\n  - 'packages/*'\n  - '!packages/api'\n"],
    ['lists no package', 'strictDepBuilds: false\n'],
  ])('keeps a file of its own under a workspace that %s: the project installs alone', (_, settings) => {
    const { project } = workspace(settings);

    const notes = notesOf(project, '--package-manager', 'pnpm');

    expect(read(project, OWN_FILE)).toMatch(/^overrides:/m);
    expect(read(project, OWN_FILE)).toMatch(/^allowBuilds:/m);
    expect(notes).not.toContain('so no pnpm-workspace.yaml is written here');
    expect(pnpmSettingsFile(project)).toBe(`${project}/${OWN_FILE}`);
  });

  it('leaves npm alone: a project on npm under a pnpm workspace writes its package.json as ever', () => {
    const { project } = workspace("packages:\n  - 'packages/*'\n");

    const notes = notesOf(project, '--package-manager', 'npm');

    expect(notes).not.toContain('so no pnpm-workspace.yaml is written here');
    expect(JSON.parse(read(project, 'package.json')).overrides).toMatchObject({ qs: '^6.16.0' });
  });

  it('asks the workspace to list the clients of the contract, once, where it lists its packages', () => {
    const { root, project } = workspace("packages:\n  - 'packages/*'\n");

    notesOf(project);

    expect(cli(project, 'sdk').stdout).toContain(
      `note: ${root}/${OWN_FILE} lists the packages of the workspace: add 'packages/api/clients/*' to them`,
    );

    write(root, OWN_FILE, "packages:\n  - 'packages/*'\n  - 'packages/api/clients/*'\n");

    expect(cli(project, 'sdk').stdout).not.toContain('lists the packages of the workspace');
    expect(fs.existsSync(path.join(project, OWN_FILE))).toBe(false);
  });
});
