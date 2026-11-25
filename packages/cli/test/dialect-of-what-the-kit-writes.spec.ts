import { describe, expect, it } from 'vitest';
import { cli, read, scaffoldEverything, tempDir, walk, write } from './helpers';
import { inDialect } from '../src/package-manager/in-dialect';
import { initProject } from './support/init-project';

const TEAM =
  'Before pnpm we ran `npm install` and committed package-lock.json; the legacy job still calls `npx tsc` and `npm run build -- --watch`.';

describe('the dialect of the package manager, in a project that installs with pnpm', () => {
  it('is spoken by everything the kit writes: the files of init, of every generator and of docs', () => {
    const root = tempDir('dialect');

    scaffoldEverything(root);

    expect(cli(root, 'docs').code).toBe(0);
    expect(cli(root, 'docs', '--behaviour').code).toBe(0);

    const spokenForNpm = walk(root).filter((file) => {
      const text = read(root, file);

      return inDialect(text, 'pnpm') !== text;
    });

    expect(spokenForNpm).toEqual([]);
  }, 120_000);

  it('leaves a sentence of the team as it wrote it in a page a generator adds a glossary row to', () => {
    const root = initProject('--context', 'billing:core');
    const page = 'src/contexts/billing/CONTEXT.md';

    write(root, page, `${read(root, page)}\n${TEAM}\n`);

    expect(cli(root, 'generate', 'entity', 'billing', 'Line', '--term', 'Line=one row of an invoice').code).toBe(0);
    expect(read(root, page)).toContain('| Line | one row of an invoice |');
    expect(read(root, page)).toContain(TEAM);
  });

  it('leaves the comments and the strings of the team in a source a generator edits', () => {
    const root = initProject('--context', 'billing:core');
    const roles = 'src/platform/auth/roles/roles.ts';
    const kept = `// ${TEAM}\nexport const HOW_TO_BUILD = 'npm run build -- --watch';\n`;

    write(root, roles, `${read(root, roles)}\n${kept}`);

    expect(
      cli(
        root,
        'generate',
        'query',
        'billing',
        'GetInvoice',
        '--permission',
        'invoice.get',
        '--grant',
        'clerk',
        '--allow-name',
      ).code,
    ).toBe(0);

    expect(read(root, roles)).toContain("[Role.Clerk]: [billingPermissions['invoice.get']],");
    expect(read(root, roles)).toContain(kept);
  });

  it('is still spoken by a line a generator adds to a file of the team', () => {
    const root = initProject('--context', 'billing:core');

    expect(cli(root, 'generate', 'context', 'shipping', '--classification', 'supporting').code).toBe(0);
    expect(read(root, 'docs/context-map.md')).toContain('`pnpm exec ddd-ts-kit docs`');
  });
});
