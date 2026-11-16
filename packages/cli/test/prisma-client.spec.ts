import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withFolderLock } from '../src/generator-lock';
import { PRISMA_CLIENT_LOCK, prismaClientInTurn, prismaClientLockRefusal } from '../src/prisma-client';
import { cli, exists, read, tempDir, write } from './helpers';

const REPO = path.resolve(import.meta.dirname, '../../..');
const TSX = path.join(REPO, 'node_modules/.bin/tsx');
const BIN = path.join(REPO, 'packages/cli/src/bin.ts');
const PRISMA = 'node_modules/prisma/build/index.js';
const STAMP = 'generated/prisma-client.sha256';
const MAIN = 'prisma/schema/schema.prisma';

const SCHEMA = `generator client {
  provider = "prisma-client"
  output   = "../../generated/prisma"
}
`;

/**
 * A stand-in for the CLI of Prisma: it logs each run in `prisma.log`, writes the client the way
 * `prisma generate` does (the output folder removed, then written again, slowly) and the schema of
 * the tests where `-o` says. A run that finds another one writing the client logs `overlap`. It
 * fails at the step `FAIL_AT` names.
 */
const FAKE_PRISMA = `const fs = require('node:fs');
const [step, ...rest] = process.argv.slice(2);
fs.appendFileSync('prisma.log', step + '\\n');
if (process.env.FAIL_AT === step) process.exit(5);
if (step === 'generate') {
  fs.writeFileSync('generate-args', rest.join(' '));
  if (fs.existsSync('generating')) fs.appendFileSync('prisma.log', 'overlap\\n');
  fs.writeFileSync('generating', '');
  fs.rmSync('generated/prisma', { recursive: true, force: true });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
  fs.mkdirSync('generated/prisma', { recursive: true });
  fs.writeFileSync('generated/prisma/client.ts', 'export {};\\n');
  fs.rmSync('generating');
} else {
  fs.writeFileSync(rest[rest.indexOf('-o') + 1], '-- the tables\\n');
}
`;

/** A Prisma project as `init` lays it out, its Prisma replaced by the stand-in. */
function prismaProject(): string {
  const root = tempDir('prisma-client');

  write(root, MAIN, SCHEMA);
  write(root, 'prisma/schema/billing.prisma', 'model Invoice {\n  id String @id\n}\n');
  write(root, 'prisma.config.ts', "export default { schema: './prisma/schema' };\n");
  write(root, PRISMA, FAKE_PRISMA);
  write(root, 'node_modules/prisma/package.json', '{ "name": "prisma", "version": "7.10.1" }\n');

  return root;
}

const runsOf = (root: string): string[] =>
  exists(root, 'prisma.log') ? read(root, 'prisma.log').trim().split('\n') : [];

/** The command in a process of its own, on its sources: what two test runs started together do. */
function started(root: string, ...args: string[]): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [BIN, 'prisma-client', ...args, '--cwd', root], { cwd: root });
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout }));
  });
}

const io = { out: () => undefined, err: () => undefined };

describe('ddd-ts-kit prisma-client', () => {
  it('generates the client, then the schema of the tests, and records what they come from', () => {
    const root = prismaProject();

    const result = cli(root, 'prisma-client', '--schema', 'prisma/schema');

    expect(result.code, result.stderr).toBe(0);
    expect(runsOf(root)).toEqual(['generate', 'migrate']);
    expect(read(root, 'generate-args')).toBe('--schema prisma/schema');
    expect(read(root, 'generated/schema.sql')).toBe('-- the tables\n');
    expect(read(root, STAMP)).toMatch(/^[0-9a-f]{64}\n$/);
    expect(exists(root, PRISMA_CLIENT_LOCK)).toBe(false);
  });

  it('writes nothing when both are current, and says so', () => {
    const root = prismaProject();

    cli(root, 'prisma-client');

    const again = cli(root, 'prisma-client');

    expect(again.code).toBe(0);
    expect(runsOf(root)).toEqual(['generate', 'migrate']);

    expect(again.stdout).toBe(
      'The Prisma client and generated/schema.sql are current with prisma/schema: nothing to generate.\n',
    );
  });

  it.each<[string, (root: string) => void]>([
    ['a file of the schema changes', (root) => write(root, 'prisma/schema/billing.prisma', 'model Invoice {}\n')],
    ['a file joins the schema', (root) => write(root, 'prisma/schema/shipping.prisma', 'model Parcel {}\n')],
    ['prisma.config.ts changes', (root) => write(root, 'prisma.config.ts', 'export default {};\n')],
    [
      'another Prisma is installed',
      (root) => write(root, 'node_modules/prisma/package.json', '{ "name": "prisma", "version": "7.11.0" }\n'),
    ],
    [
      'the client is installed',
      (root) => write(root, 'node_modules/@prisma/client/package.json', '{ "version": "7.10.1" }\n'),
    ],
    ['the client is gone', (root) => fs.rmSync(path.join(root, 'generated/prisma'), { recursive: true })],
    ['the schema of the tests is gone', (root) => fs.rmSync(path.join(root, 'generated/schema.sql'))],
    ['the stamp is gone', (root) => fs.rmSync(path.join(root, STAMP))],
    ['the stamp names other sources', (root) => write(root, STAMP, 'f'.repeat(64))],
  ])('generates both again when %s', (_, change) => {
    const root = prismaProject();

    cli(root, 'prisma-client');
    change(root);

    expect(cli(root, 'prisma-client').code).toBe(0);
    expect(runsOf(root)).toEqual(['generate', 'migrate', 'generate', 'migrate']);
  });

  it('derives them from one schema file, as versions before 0.95 kept it', () => {
    const root = tempDir('prisma-client-single');

    write(root, 'prisma/schema.prisma', SCHEMA.replace('../../generated/prisma', '../generated/prisma'));
    write(root, PRISMA, FAKE_PRISMA);

    expect(cli(root, 'prisma-client', '--schema', 'prisma/schema.prisma').code).toBe(0);
    expect(cli(root, 'prisma-client', '--schema', 'prisma/schema.prisma').code).toBe(0);
    expect(runsOf(root)).toEqual(['generate', 'migrate']);
    expect(exists(root, 'generated/prisma/client.ts')).toBe(true);
  });

  it('leaves the reading of a schema that is not there to Prisma', () => {
    const root = tempDir('prisma-client-none');

    write(root, PRISMA, FAKE_PRISMA);

    expect(cli(root, 'prisma-client').code).toBe(0);
    expect(runsOf(root)).toEqual(['generate', 'migrate']);
  });

  it.each([
    ['generate', ['generate']],
    ['migrate', ['generate', 'migrate']],
  ])('answers the exit code of Prisma when its %s fails, and records nothing', (step, runs) => {
    const root = prismaProject();

    cli(root, 'prisma-client');
    write(root, STAMP, 'f'.repeat(64));
    fs.writeFileSync(path.join(root, 'prisma.log'), '');
    process.env['FAIL_AT'] = step;

    try {
      expect(cli(root, 'prisma-client').code).toBe(5);
    } finally {
      delete process.env['FAIL_AT'];
    }

    expect(runsOf(root).filter((run) => run !== '')).toEqual(runs);
    expect(exists(root, STAMP)).toBe(false);
  });

  it('refuses a word after its options rather than ignoring it', () => {
    const root = prismaProject();

    const refused = cli(root, 'prisma-client', 'prisma/schema');

    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain('"prisma/schema" is not an argument of prisma-client');
    expect(runsOf(root)).toEqual([]);
  });

  it('names the install when Prisma is not installed', () => {
    const root = tempDir('prisma-client-uninstalled');

    write(root, MAIN, SCHEMA);

    const refused = cli(root, 'prisma-client');

    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain('prisma is not installed');
  });
});

describe('two runs of ddd-ts-kit prisma-client in one project', () => {
  it('take turns: one generates, the other finds the client current, and neither reads it half written', async () => {
    const root = prismaProject();

    const [first, second] = await Promise.all([started(root), started(root)]);

    expect([first?.code, second?.code]).toEqual([0, 0]);
    expect(runsOf(root)).toEqual(['generate', 'migrate']);
    expect(`${first?.stdout}${second?.stdout}`).toContain('are current with prisma/schema: nothing to generate.');
  }, 60_000);

  it('refuses, once its wait is over, while another run still holds the lock', () => {
    const root = prismaProject();
    const timing = { waitMs: 200, pollMs: 50, staleMs: 600_000 };
    const held = { root, lock: PRISMA_CLIENT_LOCK, command: 'ddd-ts-kit prisma-client', timing };

    const refusal = withFolderLock({ ...held, refusal: prismaClientLockRefusal }, () => {
      try {
        prismaClientInTurn({ root, schema: 'prisma/schema', io, command: 'ddd-ts-kit prisma-client', timing });

        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });

    expect(refusal).toMatch(
      new RegExp(
        `^Another run generates the Prisma client of this project: \`ddd-ts-kit prisma-client\` \\(pid ${process.pid}, started \\d+ seconds? ago\\)\\. This command waited for it and generated nothing\\.$`,
      ),
    );

    expect(runsOf(root)).toEqual([]);
  });

  it('takes over the lock of a run that ended without releasing it', () => {
    const root = prismaProject();

    fs.mkdirSync(path.join(root, PRISMA_CLIENT_LOCK), { recursive: true });

    fs.writeFileSync(
      path.join(root, PRISMA_CLIENT_LOCK, 'holder.json'),
      JSON.stringify({
        command: 'ddd-ts-kit prisma-client',
        pid: 2 ** 22 + 1,
        host: os.hostname(),
        startedAt: new Date().toISOString(),
      }),
    );

    expect(cli(root, 'prisma-client').code).toBe(0);
    expect(runsOf(root)).toEqual(['generate', 'migrate']);
    expect(exists(root, PRISMA_CLIENT_LOCK)).toBe(false);
  });
});

describe('a lock of prisma-client taken over while its run goes on', () => {
  it('is left to the run that took it over when the first one ends', () => {
    const root = prismaProject();
    const holder = path.join(root, PRISMA_CLIENT_LOCK, 'holder.json');
    const timing = { waitMs: 200, pollMs: 50, staleMs: 600_000 };

    const other = JSON.stringify({
      command: 'ddd-ts-kit prisma-client',
      pid: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
    });

    withFolderLock(
      { root, lock: PRISMA_CLIENT_LOCK, command: 'ddd-ts-kit prisma-client', timing, refusal: prismaClientLockRefusal },
      () => fs.writeFileSync(holder, other),
    );

    expect(read(root, path.join(PRISMA_CLIENT_LOCK, 'holder.json'))).toBe(other);
  });
});

describe('the refusal of a run of prisma-client that waited', () => {
  it('names the lock when it reads as nothing', () => {
    const refusal = prismaClientLockRefusal(undefined, Date.now());

    expect(refusal.message).toBe(
      '.ddd-ts-kit/prisma-client stands there and cannot be read, a link to nothing for one. This command waited for it and generated nothing.',
    );

    expect(refusal.fix).toContain('To take it at once, remove .ddd-ts-kit/prisma-client.');
  });

  it('names the command of a holder whose pid it could not read', () => {
    const refusal = prismaClientLockRefusal({ command: 'ddd-ts-kit prisma-client', startedAt: 0 }, 3000);

    expect(refusal.message).toContain('`ddd-ts-kit prisma-client` (started 3 seconds ago)');
  });

  it('names the lock when its holder has not written its name yet', () => {
    const refusal = prismaClientLockRefusal({ startedAt: 0 }, 1000);

    expect(refusal.message).toContain(
      'a command that has not written its name in .ddd-ts-kit/prisma-client yet (started 1 second ago)',
    );
  });
});
