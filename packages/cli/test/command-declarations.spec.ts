import { describe, expect, it } from 'vitest';
import type { Declaration } from '../src/commands/command';
import { usageLinesOf } from '../src/help/usage-lines-of';
import { COMMANDS } from '../src/run';

/** What every command accepts, which a usage line may name beside the options of its command. */
const OF_EVERY_COMMAND = ['json', 'cwd', 'help'];

const DECLARED: readonly Declaration[] = Object.values(COMMANDS).flatMap((command) => command.spec ?? []);

/** The options the usage lines of a command name, each once, without its dashes. */
function optionsInUsageOf(command: string): string[] {
  const named = usageLinesOf(command).flatMap((line) =>
    [...line.matchAll(/--([a-z][a-z-]*)/g)].map(([, name]) => name),
  );

  return [...new Set(named)].filter((name) => name !== undefined && !OF_EVERY_COMMAND.includes(name)).sort();
}

describe('a command declared with defineCommand', () => {
  it('is declared under the name the entry runs it by', () => {
    const named = Object.entries(COMMANDS).flatMap(([name, command]) =>
      command.spec === undefined || command.spec.name === name ? [] : [`${name} declares ${command.spec.name}`],
    );

    expect(DECLARED.length).toBeGreaterThan(2);
    expect(named).toEqual([]);
  });

  it.each(DECLARED.map((spec) => [spec.name, spec] as const))(
    '%s names in its usage exactly the options it declares',
    (name, spec) => {
      expect(optionsInUsageOf(name)).toEqual(Object.keys(spec.options).sort());
    },
  );
});
