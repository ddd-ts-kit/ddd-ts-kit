import { describe, expect, it } from 'vitest';
import { cli, read } from './helpers';
import { initProject } from './support/init-project';

const BILLING = 'src/contexts/billing';
const READER = `${BILLING}/infrastructure/persistence/in-memory-get-invoice-reader.repository.ts`;
const READER_SPEC = `${BILLING}/test/integration/in-memory-get-invoice-reader.repository.spec.ts`;
const FAKE = `${BILLING}/test/fakes/get-invoice-reader.fake.ts`;

describe('generate query', () => {
  it('writes a reader that refuses until its read is written, a spec that runs it and a fake of the port alone', () => {
    const root = initProject('--context', 'billing:core');

    cli(root, 'generate', 'aggregate', 'billing', 'Invoice', '--term', 'Invoice=x');

    const result = cli(
      root,
      'generate',
      'query',
      'billing',
      'GetInvoice',
      '--permission',
      'invoice.read',
      '--term',
      'Get=x',
      '--term',
      'Read=x',
    );

    expect(result.code).toBe(0);
    expect(read(root, READER)).toContain(`    throw undecided('what "get invoice" reads');`);
    expect(read(root, READER)).not.toContain('answer');
    // One running test says what the fresh reader does, so that a generated project covers it as generated.
    expect(read(root, READER_SPEC)).toContain(`it('refuses until what "get invoice" reads is written', async () => {`);
    expect(read(root, READER_SPEC)).toContain("it.todo('answers only what the asker may see');");
    expect(read(root, FAKE)).toContain('export class FakeGetInvoiceReader implements GetInvoiceReader {');
    expect(read(root, FAKE)).not.toContain('InMemoryGetInvoiceReader');
  });
});
