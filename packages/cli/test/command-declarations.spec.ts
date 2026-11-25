import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../src/commands';
import { usageLine } from '../src/commands/usage-line';
import { COMMON_FLAGS } from '../src/generate/generate-options';
import { cli, tempDir } from './helpers';

/** What every command accepts, which a usage line may name beside the options of its command. */
const OF_EVERY_COMMAND = ['json', 'cwd', 'help'];

const DECLARED = COMMANDS.map((command) => command.spec);

/** The options the usage lines name, each once, without its dashes. */
function optionsIn(usage: readonly string[]): string[] {
  const named = usage.flatMap((line) => [...line.matchAll(/--([a-z][a-z-]*)/g)].map(([, name]) => name));

  return [...new Set(named)].filter((name) => name !== undefined && !OF_EVERY_COMMAND.includes(name)).sort();
}

describe('the commands of the CLI, as they declare themselves', () => {
  it('each answer to a name and an alias no other command has', () => {
    const names = DECLARED.flatMap(({ name, alias }) => [name, ...(alias === undefined ? [] : [alias])]);

    expect(names.length).toBeGreaterThan(40);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it.each(DECLARED.map((spec) => [spec.name, spec] as const))(
    '%s names in its usage exactly the options it declares',
    (name, spec) => {
      // `generate` names the flags every kind takes; each kind names its own (`generate <kind> --help`).
      const declared = name === 'generate' ? COMMON_FLAGS : Object.keys(spec.options);

      expect(optionsIn(spec.usage)).toEqual([...declared].sort());
    },
  );
});

describe('the usage of a command that does not write it by hand', () => {
  it('names its positional arguments, then each option with what it takes, in the order declared', () => {
    const line = usageLine({
      name: 'sample',
      positionals: '[<context>]',
      options: {
        base: { type: 'string', value: '<ref>' },
        format: { type: 'string', values: ['text', 'json'] },
        rule: { type: 'string', value: '<id>', multiple: true },
        name: { type: 'string' },
        'dry-run': { type: 'boolean' },
      },
    });

    expect(line).toBe(
      'ddd-ts-kit sample [<context>] [--base <ref>] [--format text|json] [--rule <id>]... [--name <name>] [--dry-run]',
    );
  });

  it('is the line the help prints and a refused argument is answered with', () => {
    const root = tempDir('declared-usage');
    const usage = 'ddd-ts-kit worktree <name> [--base <ref>] [--branch <name>] [--no-install] [--dry-run]';

    expect(cli(root, 'worktree', '--help').stdout.split('\n')[1]).toBe(`  ${usage}`);
    expect(cli(root, 'worktree', '--nope').stderr).toContain(`fix: ${usage}`);
  });
});

describe('an option that names its values', () => {
  it.each([
    [['acceptance', '--gate', 'done'], 'Unknown value "done" for --gate.', 'Use one of: written, passing.'],
    [['story', '--gate', 'done'], 'Unknown value "done" for --gate.', 'Use one of: build, close.'],
    [['story-scope', 'US1', '--kind', 'epic'], 'Unknown value "epic" for --kind.', 'Use one of: story, fix.'],
    [
      ['error-factories', '--plan', '--to', 'records'],
      'Unknown value "records" for --to.',
      'Use one of: named, factories.',
    ],
    [['check', '--baseline', 'keep'], 'Unknown value "keep" for --baseline.', 'Use one of: write, prune.'],
    [['measures', '--format', 'github'], 'Unknown value "github" for --format.', 'Use one of: text, json.'],
  ])('is held to them by the parser: %j', (argv, message, fix) => {
    const refused = cli(tempDir('declared-values'), ...argv);

    expect(refused.code).toBe(2);
    expect(refused.stderr).toBe(`error: ${message}\n  fix: ${fix}`);
  });

  it('refuses --json beside another of the formats it names', () => {
    const refused = cli(tempDir('declared-two-outputs'), 'affected', '--format', 'github', '--json');

    expect(refused.code).toBe(2);

    expect(refused.json()).toEqual({
      error: {
        message: '--json and --format github ask for two outputs.',
        fix: 'Give one of them: --json is --format json.',
      },
    });
  });
});

describe('the modes of check', () => {
  it.each([
    [['--baseline', 'write', '--rule', 'clean/braces'], 'ddd-ts-kit check --baseline write|prune'],
    [['--commit-size', '--explain'], 'ddd-ts-kit check --commit-size [--staged] [--strict]'],
    [
      ['--clean-only', '--changed-since', 'main'],
      'ddd-ts-kit check --clean-only <dir>... [--rule <id>]... [--format text|json|github]',
    ],
  ])('answer an option of another mode with their own usage: %j', (argv, usage) => {
    const refused = cli(tempDir('declared-modes'), 'check', ...argv);

    expect(refused.code).toBe(2);
    expect(refused.stderr.split('\n').slice(1)).toEqual([`  fix: ${usage}`]);
  });

  it('answer with the usage of them all an option none of them takes, and one refused beside --self', () => {
    const root = tempDir('declared-modes-whole');

    for (const argv of [['--staged'], ['--self', '--rule', 'clean/braces']]) {
      const fix = cli(root, 'check', ...argv)
        .stderr.split('\n')
        .slice(1);

      expect(fix).toHaveLength(4);
      expect(fix[0]).toContain('fix: ddd-ts-kit check [paths...]');
      expect(fix[3]).toContain('ddd-ts-kit check --commit-size [--staged] [--strict]');
    }
  });
});
