import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config';
import { settleSameNames } from '../src/generate/kinds/same-name/settle-same-names';
import { Workspace } from '../src/workspace';
import { cli, read, write } from './helpers';
import { expectOk } from './support/expect-ok';
import { initProject } from './support/init-project';
import { CONTEXTS, INDEX } from './support/same-name-project';

/** A workspace whose reading fails where a case says: what the kit cannot foresee in a project. */
class FailingWorkspace extends Workspace {
  private reads = 0;

  constructor(
    root: string,
    private readonly fails: (file: string, reads: number) => boolean,
  ) {
    super(root, false);
  }

  override read(asked: string): string | undefined {
    this.reads += 1;

    if (this.fails(asked, this.reads)) {
      throw new Error(`cannot read ${asked}`);
    }

    return super.read(asked);
  }
}

/** A project of an ORM whose contexts billing and shipping each store Order. */
function twoOrders(orm: string): string {
  const root = initProject('--orm', orm, ...CONTEXTS);

  for (const context of ['billing', 'shipping']) {
    expectOk(cli(root, 'generate', 'aggregate', context, 'Order', '--term', `Order=What ${context} keeps`));
    expectOk(cli(root, 'generate', 'repository', context, 'Order'));
  }

  return root;
}

/** A workspace in which the tables file of billing gains a table as soon as the index is written: a file edited under the command. */
class ChangingWorkspace extends Workspace {
  private written = false;

  override update(asked: string, content: string): void {
    this.written = true;
    super.update(asked, content);
  }

  override read(asked: string): string | undefined {
    const held = super.read(asked);

    return this.written && asked.endsWith('billing.schema.ts') ? `${held ?? ''}\nexport const jobs = 1;\n` : held;
  }
}

describe('an error while the names of the schema index are settled', () => {
  it('puts the index back and says so when what it wrote leaves a table under no name', () => {
    const root = twoOrders('drizzle');
    const unsettled = read(root, INDEX).replace(/^export \{.*\n/gm, '');

    write(root, INDEX, unsettled);

    const ws = new ChangingWorkspace(root, false);
    const said = settleSameNames(ws, readConfig(root).config, { newcomers: ['shipping'] });

    expect(said).toEqual([expect.stringContaining('what it was about to write would leave under no name')]);
    expect(said[0]).toContain('billing.schema.ts#jobs');
    expect(ws.read(INDEX)).toBe(unsettled);
  });

  it('writes nothing on Drizzle and says why, the command going on', () => {
    const root = twoOrders('drizzle');
    const ws = new FailingWorkspace(root, (file) => file.endsWith('billing.schema.ts'));
    const said = settleSameNames(ws, readConfig(root).config, { newcomers: ['shipping'] });

    expect(said).toEqual([
      expect.stringContaining(`${INDEX}: the kit wrote no name in it: reading it and its tables files failed`),
    ]);

    expect(said[0]).toContain('cannot read src/contexts/billing/infrastructure/persistence/billing.schema.ts');
    expect(ws.read(INDEX)).toBe(read(root, INDEX));
  });
});
