import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, write } from '../helpers';

const WORKSPACE_MODULES = path.join(REPO_ROOT, 'node_modules');
const PUBLISHED_PARTS = ['package.json', 'dist', 'templates', 'prisma'];
/** The two runners the workspace does not install: knip only needs to see that they bring the binaries the scripts name. */
const ABSENT_RUNNERS = ['tsx', 'drizzle-kit'];

/**
 * A node_modules as `npm install` leaves it: the packages of the kit are real directories (a link
 * into the workspace would make the import graph leave the project), the rest links to the workspace.
 */
export function installAsPublished(root: string): void {
  const installed = path.join(root, 'node_modules');

  fs.mkdirSync(path.join(installed, '@ddd-ts-kit'), { recursive: true });

  for (const entry of fs.readdirSync(WORKSPACE_MODULES)) {
    if (entry !== '@ddd-ts-kit' && entry !== 'ddd-ts-kit' && entry !== '.bin') {
      fs.symlinkSync(path.join(WORKSPACE_MODULES, entry), path.join(installed, entry));
    }
  }

  for (const directory of fs.readdirSync(path.join(REPO_ROOT, 'packages'))) {
    copyPackage(path.join(REPO_ROOT, 'packages', directory), installed);
  }

  for (const runner of ABSENT_RUNNERS) {
    stubRunner(installed, runner);
  }

  linkBinaries(installed);
}

/**
 * The binaries of the workspace, and those of the kit as launchers of the copy installed here: the
 * link of the workspace names a file its build may have written without the right to be run.
 */
function linkBinaries(installed: string): void {
  const binaries = path.join(installed, '.bin');

  const kit = JSON.parse(fs.readFileSync(path.join(installed, 'ddd-ts-kit/package.json'), 'utf8')) as {
    bin: Record<string, string>;
  };

  fs.mkdirSync(binaries);

  for (const entry of fs.readdirSync(path.join(WORKSPACE_MODULES, '.bin'))) {
    if (!(entry in kit.bin)) {
      fs.symlinkSync(path.join(WORKSPACE_MODULES, '.bin', entry), path.join(binaries, entry));
    }
  }

  for (const [name, file] of Object.entries(kit.bin)) {
    const built = path.join(installed, 'ddd-ts-kit', file);

    fs.writeFileSync(path.join(binaries, name), `#!/bin/sh\nexec node "${built}" "$@"\n`, { mode: 0o755 });
  }
}

function copyPackage(source: string, installed: string): void {
  linkOwnDependencies(source, installed);

  const { name } = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')) as { name: string };

  for (const part of PUBLISHED_PARTS) {
    if (fs.existsSync(path.join(source, part))) {
      fs.cpSync(path.join(source, part), path.join(installed, name, part), { recursive: true });
    }
  }
}

/** What npm kept inside one workspace package instead of hoisting (the Redis client): a project that installs the kit gets it at the top. */
function linkOwnDependencies(source: string, installed: string): void {
  const own = path.join(source, 'node_modules');

  for (const entry of fs.existsSync(own) ? fs.readdirSync(own) : []) {
    if (entry.startsWith('.') || fs.existsSync(path.join(installed, entry))) {
      continue;
    }

    fs.symlinkSync(path.join(own, entry), path.join(installed, entry));
  }
}

function stubRunner(installed: string, runner: string): void {
  if (fs.existsSync(path.join(installed, runner))) {
    return;
  }

  write(
    installed,
    `${runner}/package.json`,
    JSON.stringify({ name: runner, version: '0.0.0', bin: { [runner]: 'bin.js' } }),
  );

  write(installed, `${runner}/bin.js`, '');
}
