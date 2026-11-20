import { describe, expect, it } from 'vitest';
import { cli, read, write } from './helpers';
import { initProject } from './support/init-project';

function upstreamsOf(root: string, context: string): unknown {
  return JSON.parse(read(root, 'ddd-ts-kit.config.json')).contexts[context].upstreams;
}

describe('generate context --upstream on a context that exists', () => {
  it('declares the upstream it does not declare yet, and the next generator finds it', () => {
    const root = initProject('--context', 'catalog:core', '--context', 'ordering:core', '--audit', 'off');

    const result = cli(root, 'generate', 'context', 'ordering', '--classification', 'core', '--upstream', 'catalog');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('ddd-ts-kit.config.json');
    expect(upstreamsOf(root, 'ordering')).toEqual([{ context: 'catalog', relationship: 'published-language' }]);
    expect(read(root, 'src/contexts/catalog/CONTEXT.md')).toContain('ordering');
  });

  it('keeps the config as it is when the upstream is declared already', () => {
    const root = initProject('--context', 'catalog:core', '--audit', 'off');

    cli(root, 'generate', 'context', 'ordering', '--classification', 'core', '--upstream', 'catalog');
    const config = read(root, 'ddd-ts-kit.config.json');

    const again = cli(root, 'generate', 'context', 'ordering', '--classification', 'core', '--upstream', 'catalog');

    expect(again.code).toBe(0);
    expect(read(root, 'ddd-ts-kit.config.json')).toBe(config);
  });

  it('refuses an upstream that already depends on the context, nothing written', () => {
    const root = initProject('--context', 'catalog:core', '--audit', 'off');

    cli(root, 'generate', 'context', 'ordering', '--classification', 'core', '--upstream', 'catalog');
    cli(root, 'generate', 'context', 'billing', '--classification', 'supporting', '--upstream', 'ordering');
    const config = read(root, 'ddd-ts-kit.config.json');

    const refused = cli(root, 'generate', 'context', 'catalog', '--classification', 'core', '--upstream', 'billing');

    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain('"billing" already depends on "catalog" (billing -> ordering -> catalog)');
    expect(refused.stderr).toContain('context/no-cycle');
    expect(read(root, 'ddd-ts-kit.config.json')).toBe(config);
  });

  it('follows a cycle the config already holds without looping', () => {
    const root = initProject(
      '--context',
      'catalog:core',
      '--context',
      'ordering:core',
      '--context',
      'billing:core',
      '--audit',
      'off',
    );

    const config = JSON.parse(read(root, 'ddd-ts-kit.config.json'));

    config.contexts.ordering.upstreams = [{ context: 'billing', relationship: 'published-language' }];
    config.contexts.billing.upstreams = [{ context: 'ordering', relationship: 'published-language' }];
    write(root, 'ddd-ts-kit.config.json', JSON.stringify(config, null, 2));

    const result = cli(root, 'generate', 'context', 'catalog', '--classification', 'core', '--upstream', 'ordering');

    expect(result.code).toBe(0);
    expect(upstreamsOf(root, 'catalog')).toEqual([{ context: 'ordering', relationship: 'published-language' }]);
  });
});
