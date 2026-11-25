import { describe, expect, it } from 'vitest';
import { cli, exists } from './helpers';
import { failure } from './reports';
import { initProject } from './support/init-project';

const WORDS = ['Return', 'case', 'Default', 'package', 'Class', 'import', 'New', 'delete', 'Enum', 'void'];
const GLOBALS = ['Date', 'error', 'Record', 'map', 'Set', 'promise', 'Array', 'Readonly', 'pick'];

describe('the names no generated code can bear', () => {
  const project = (): string => initProject('--context', 'notes:core', '--audit', 'off');

  it.each(WORDS)('are refused for a concept named after the reserved word of %s, with the reason', (name) => {
    const root = project();
    const refused = failure(cli(root, 'generate', 'aggregate', 'notes', name, '--term', `${name}=x`, '--json'));
    const word = name.toLowerCase();

    expect(refused.message).toBe(
      `"${name}" is not a valid aggregate name: \`${word}\` is a reserved word of the language, and the generated code names a variable after the aggregate.`,
    );

    expect(refused.fix).toBe(
      'Name the aggregate in two words, as the business tells it from its neighbours: ReturnOrder, SupportCase, DueDate.',
    );

    expect(exists(root, `src/contexts/notes/domain/aggregates/${word}.aggregate.ts`)).toBe(false);
  });

  it.each(GLOBALS)('are refused for a concept named after the global of %s, with the reason', (name) => {
    const root = project();
    const refused = failure(cli(root, 'generate', 'value-object', 'notes', name, '--term', `${name}=x`, '--json'));
    const global = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    expect(refused.message).toBe(
      `"${name}" is not a valid value object name: the generated code uses \`${global}\` of the language, which a class of that name would hide.`,
    );
  });

  it('are refused with --allow-name too, which lets no such name compile', () => {
    expect(cli(project(), 'generate', 'aggregate', 'notes', 'Return', '--term', 'Return=x', '--allow-name').code).toBe(
      2,
    );
  });

  it('leave alone a name that holds one among its words, or only starts like one', () => {
    const root = project();

    for (const name of ['ReturnOrder', 'SupportCase', 'DueDate', 'Classroom', 'Mapping']) {
      expect(cli(root, 'generate', 'port', 'notes', name, '--allow-name').code).toBe(0);
    }
  });
});
