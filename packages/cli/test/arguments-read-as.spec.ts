import { describe, expect, it } from 'vitest';
import { Arguments, type OptionSpecs } from '../src/commands/arguments';

/** The options of two readers at once: `--command` a switch for one, the other reading none of it. */
const EVERY_READER: OptionSpecs = {
  command: { type: 'boolean' },
  cache: { type: 'string', values: ['public', 'private'] },
  term: { type: 'string', multiple: true },
  every: { type: 'string' },
};

const readFor = (...argv: string[]): Arguments<string, string, string> => Arguments.declared(argv, EVERY_READER);

describe('arguments read for several readers, handed to one', () => {
  it('reach a reader whose options hold the values read: a switch, a named value, several texts, a text', () => {
    const args = readFor('--command', '--cache', 'public', '--term', 'A=b', '--term', 'C=d', '--every', '1d');

    Arguments.readAs(args, {
      command: { type: 'boolean' },
      cache: { type: 'string', values: ['public', 'private', 'no-store'] },
      term: { type: 'string', multiple: true },
      every: { type: 'string' },
    });

    expect([args.flag('command'), args.text('cache'), args.many('term'), args.text('every')]).toEqual([
      true,
      'public',
      ['A=b', 'C=d'],
      '1d',
    ]);
  });

  it('reach a reader of options none of the command line gives', () => {
    const args = readFor();

    expect(() => Arguments.readAs(args, { name: { type: 'string' }, global: { type: 'boolean' } })).not.toThrow();
  });

  it('are refused to a reader that declares an option another shape than it was read with', () => {
    expect(() => Arguments.readAs(readFor('--command'), { command: { type: 'string' } })).toThrow(
      '--command was not read as it is declared.',
    );

    expect(() => Arguments.readAs(readFor('--every', '1d'), { every: { type: 'boolean' } })).toThrow(
      '--every was not read as it is declared.',
    );

    expect(() => Arguments.readAs(readFor('--every', '1d'), { every: { type: 'string', multiple: true } })).toThrow(
      '--every was not read as it is declared.',
    );

    expect(() =>
      Arguments.readAs(readFor('--cache', 'private'), { cache: { type: 'string', values: ['public'] } }),
    ).toThrow('--cache was not read as it is declared.');
  });
});
