import { describe, expect, it } from 'vitest';
import { Arguments } from '../src/commands/arguments';
import { cli } from './helpers';
import { projectWith } from './rules-support';
import { failure } from './reports';

const FORMATS = ['text', 'json', 'github'] as const;

const formatOf = (...argv: string[]): string =>
  Arguments.declared(argv, { format: { type: 'string', values: FORMATS } }).format('text');

describe('the output format of a command', () => {
  it('is the one --format names, the default without it', () => {
    expect(formatOf()).toBe('text');
    expect(formatOf('--format', 'github')).toBe('github');
  });

  it('is JSON under --json, under --format json and under both', () => {
    expect(formatOf('--json')).toBe('json');
    expect(formatOf('--format', 'json')).toBe('json');
    expect(formatOf('--json', '--format', 'json')).toBe('json');
  });

  it('is refused when --json stands beside another format, and when the command does not print it', () => {
    expect(() => formatOf('--json', '--format', 'github')).toThrow('--json and --format github ask for two outputs.');
    expect(() => formatOf('--format', 'xml')).toThrow('Unknown value "xml" for --format.');
  });
});

describe('check, affected and measures', () => {
  const root = projectWith({});

  it.each([
    ['check', 'text'],
    ['affected', 'github'],
    ['measures', 'text'],
  ])('%s refuses --json beside --format %s', (command, format) => {
    const refused = cli(root, command, '--format', format, '--json');

    expect(refused.code).toBe(2);
    expect(failure(refused).message).toBe(`--json and --format ${format} ask for two outputs.`);
  });

  it.each(['check', 'affected', 'measures'])('%s names the formats it prints when asked for another', (command) => {
    const refused = cli(root, command, '--format', 'xml');

    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain('Unknown value "xml" for --format.');
    expect(refused.stderr).toContain('Use one of: text, json');
  });

  it('check and measures print the same JSON under --json and under --format json', () => {
    expect(cli(root, 'check', '--format', 'json').stdout).toBe(cli(root, 'check', '--json').stdout);
    expect(cli(root, 'measures', '--format', 'json').stdout).toBe(cli(root, 'measures', '--json').stdout);
  });
});
