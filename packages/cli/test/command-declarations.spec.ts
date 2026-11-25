import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../src/commands';
import type { Declaration } from '../src/commands/command';
import { usageLine } from '../src/commands/usage-line';
import { COMMON_FLAGS } from '../src/generate/generate-options';
import { cli, tempDir } from './helpers';

/** What every command accepts, which a usage line may name beside the options of its command. */
const OF_EVERY_COMMAND = ['json', 'cwd', 'help'];

const DECLARED = COMMANDS.map((command) => command.spec);

/** Every command and every mode as it declares itself alone: a command with modes is read mode by mode. */
const EACH_ALONE = DECLARED.flatMap((spec) => (spec.modes.length === 0 ? [spec] : spec.modes));

function label({ name, mode }: Declaration): string {
  return mode === undefined ? name : `${name} --${mode.chosenBy}`;
}

/**
 * Each option a command or one of its modes does not declare and another of its modes does, with
 * the words that ask for it: the option that chooses the mode, then the refused one. An option that
 * chooses a mode is not refused by the command itself: it runs that mode.
 */
const REFUSED_BESIDE = DECLARED.flatMap(({ modes }) =>
  modes.flatMap((asked) =>
    [...new Map(modes.flatMap((owner) => Object.keys(owner.options).map((option) => [option, owner] as const)))]
      .filter(([option]) => !Object.hasOwn(asked.options, option))
      .filter(([option]) => asked.mode !== undefined || modes.every(({ mode }) => mode?.chosenBy !== option))
      .map(([option, owner]) => ({
        called: label(asked),
        option,
        asked,
        owner,
        argv: [asked.name, ...wordsOf(asked, asked.mode?.chosenBy), ...wordsOf(owner, option)],
      })),
  ),
);

/** How a command line writes an option of a declaration, with a value it takes. */
function wordsOf({ options }: Declaration, option: string | undefined): string[] {
  const spec = option === undefined ? undefined : options[option];

  if (spec === undefined) {
    return [];
  }

  return spec.type === 'boolean' ? [`--${option}`] : [`--${option}`, spec.values?.[0] ?? 'main'];
}

/** The options the usage lines name, each once, without its dashes. */
function optionsIn(usage: readonly string[]): string[] {
  const named = usage.flatMap((line) => [...line.matchAll(/--([a-z][a-z-]*)/g)].flatMap(([, name]) => name ?? []));

  return [...new Set(named)].filter((name) => !OF_EVERY_COMMAND.includes(name)).sort();
}

describe('the commands of the CLI, as they declare themselves', () => {
  it('each answer to a name and an alias no other command has', () => {
    const names = DECLARED.flatMap(({ name, alias }) => [name, ...(alias === undefined ? [] : [alias])]);

    expect(names.length).toBeGreaterThan(40);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it.each(EACH_ALONE.map((spec) => [label(spec), spec] as const))(
    '%s names in its usage exactly the options it declares',
    (_, spec) => {
      // `generate` names the flags every kind takes; each kind names its own (`generate <kind> --help`).
      const declared = spec.name === 'generate' ? COMMON_FLAGS : Object.keys(spec.options);

      expect(optionsIn(spec.usage)).toEqual([...declared].sort());
    },
  );

  it('have, among those with modes, each mode chosen by an option it declares and no other mode does', () => {
    const modes = DECLARED.flatMap((spec) => spec.modes.flatMap(({ mode }) => (mode === undefined ? [] : [mode])));

    expect(modes.map(({ chosenBy }) => chosenBy)).toEqual(['baseline', 'clean-only', 'commit-size', 'self']);

    for (const { modes: together } of DECLARED) {
      for (const { mode, options } of together) {
        const others = together.filter((other) => other.mode !== mode);

        expect(mode === undefined || Object.hasOwn(options, mode.chosenBy)).toBe(true);
        expect(others.filter((other) => mode !== undefined && Object.hasOwn(other.options, mode.chosenBy))).toEqual([]);
      }
    }
  });

  it.each(REFUSED_BESIDE)('$called refuses --$option, which another of its modes declares', (refusal) => {
    const { asked, option, owner } = refusal;
    const refused = cli(tempDir('declared-modes-each'), ...refusal.argv);

    const message =
      asked.mode === undefined
        ? `--${option} is an option of ${label(owner)}.`
        : `${label(asked)} does not take --${option}: ${asked.mode.because}.`;

    expect(refused.code).toBe(2);

    expect(refused.stderr).toBe(
      `error: ${message}\n  fix: ${(asked.mode === undefined ? owner : asked).usage.join('')}`,
    );
  });
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
    [
      ['--baseline', 'write', '--rule', 'clean/braces'],
      'check --baseline does not take --rule: it judges every rule on every file.',
      'ddd-ts-kit check --baseline write|prune',
    ],
    [
      ['--baseline', 'prune', '--clean-only'],
      'check --baseline does not take --clean-only: it judges every rule on every file.',
      'ddd-ts-kit check --baseline write|prune',
    ],
    [
      ['--clean-only', '--changed-since=main'],
      'check --clean-only does not take --changed-since: it judges the directories given as they are, outside a project, its history and its baseline.',
      'ddd-ts-kit check --clean-only <dir>... [--rule <id>]... [--format text|json|github|gitlab] [--explain]',
    ],
    [
      ['--commit-size', '--explain'],
      'check --commit-size does not take --explain: it measures what is about to be committed and runs no rule.',
      'ddd-ts-kit check --commit-size [--staged] [--strict]',
    ],
    [
      ['--self', '--format', 'github'],
      'check --self does not take --format: it replays the fixtures shipped with the CLI, whatever the project.',
      'ddd-ts-kit check --self',
    ],
    [
      ['--staged'],
      '--staged is an option of check --commit-size.',
      'ddd-ts-kit check --commit-size [--staged] [--strict]',
    ],
  ])('refuse an option of another mode with their reason and their usage: %j', (argv, message, usage) => {
    const refused = cli(tempDir('declared-modes'), 'check', ...argv);

    expect(refused.code).toBe(2);
    expect(refused.stderr).toBe(`error: ${message}\n  fix: ${usage}`);
  });

  it('leave to the parser an option none of them knows: a mode answers with its usage, check itself with all of them', () => {
    const root = tempDir('declared-modes-unknown');
    const ofTheMode = cli(root, 'check', '--baseline', 'write', '--nope').stderr.split('\n');
    const ofThemAll = cli(root, 'check', '--nope').stderr.split('\n');

    expect(ofTheMode[0]).toContain("error: Unknown option '--nope'.");
    expect(ofTheMode.slice(1)).toEqual(['  fix: ddd-ts-kit check --baseline write|prune']);
    expect(ofThemAll[0]).toContain("error: Unknown option '--nope'.");
    expect(ofThemAll).toHaveLength(6);
    expect(ofThemAll.at(-1)).toBe('       ddd-ts-kit check --self');
  });
});
