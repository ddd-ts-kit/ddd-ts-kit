import { describe, expect, it } from 'vitest';
import { tscCommand } from '../src/commands/tsc';
import { run } from '../src/run';
import { cli, tempDir, write } from './helpers';

/** A compiler that answers what it was asked and where, standing for the native one. */
function installCompiler(modules: string): void {
  write(
    modules,
    'node_modules/@typescript/native/package.json',
    JSON.stringify({ name: 'typescript', bin: { tsc: './bin/tsc' } }),
  );

  write(
    modules,
    'node_modules/@typescript/native/bin/tsc',
    "console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\nif (process.argv.includes('--fail')) { console.error('error TS2322'); process.exit(2); }\n",
  );
}

describe('ddd-ts-kit tsc', () => {
  it('runs the native compiler of the project with the arguments as given', () => {
    const root = tempDir('tsc');

    installCompiler(root);
    write(root, 'package.json', '{}');

    const result = cli(root, 'tsc', '-p', 'tsconfig.json', '--noEmit');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ args: ['-p', 'tsconfig.json', '--noEmit'] });
  });

  it('finds it hoisted to the root of a workspace, and runs it in the project', () => {
    const workspace = tempDir('tsc');

    installCompiler(workspace);
    write(workspace, 'packages/api/package.json', '{}');

    const result = cli(`${workspace}/packages/api`, 'tsc', '-b', 'clients');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ args: ['-b', 'clients'] });
    expect(JSON.parse(result.stdout).cwd).toMatch(/packages[\\/]api$/);
  });

  it('answers the exit code and the errors of the compiler', () => {
    const root = tempDir('tsc');

    installCompiler(root);
    write(root, 'package.json', '{}');

    const result = cli(root, 'tsc', '--fail');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('error TS2322');
  });

  it('reads --cwd written with an equals sign', () => {
    const root = tempDir('tsc');
    const out: string[] = [];

    installCompiler(root);
    write(root, 'package.json', '{}');

    const code = run(['tsc', `--cwd=${root}`, '--noEmit'], { out: (text) => out.push(text), err: () => undefined });

    expect(code).toBe(0);
    expect(JSON.parse(out.join('\n'))).toMatchObject({ args: ['--noEmit'] });
  });

  it('takes the directory it is run from as the project when no --cwd names one', () => {
    const out: string[] = [];

    const code = tscCommand(['--version'], { out: (text) => out.push(text), err: () => undefined });

    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/^Version 7\./);
  });

  it('passes --help on to the compiler, and --cwd, which the helper writes apart, is not', () => {
    const root = tempDir('tsc');

    installCompiler(root);
    write(root, 'package.json', '{}');

    const result = cli(root, 'tsc', '--help');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ args: ['--help'] });
  });

  it('leaves `help tsc` to the help of the kit', () => {
    const result = cli(tempDir('tsc'), 'help', 'tsc');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('ddd-ts-kit tsc');
    expect(result.stdout).toContain('@typescript/native');
  });

  it('refuses a project where the native compiler is not installed, naming the install', () => {
    const root = tempDir('tsc');

    write(root, 'package.json', '{}');

    const result = cli(root, 'tsc', '--noEmit');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('The native TypeScript compiler (@typescript/native) is not installed');
  });
});
