import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, read, write } from './helpers';
import { report } from './reports';
import { expectOk } from './support/expect-ok';
import { initProject } from './support/init-project';

const HANDLER = 'src/contexts/billing/application/commands/void-invoice/void-invoice.handler.ts';
const SPEC = 'test/e2e/void-invoice.e2e.spec.ts';

describe('generate e2e on a use case whose handler is still as generated', () => {
  it('holds the scenarios that wait for it with pending(...), says so, and writes them plain once the handler is written', () => {
    const root = initProject('--context', 'billing:core');
    const terms = ['--term', 'Invoice=A request for payment', '--term', 'Void=Cancel an issued invoice'];
    const route = ['--method', 'DELETE', '--path', '/invoices/:invoiceId'];

    expectOk(cli(root, 'generate', 'aggregate', 'billing', 'Invoice', ...terms));
    expectOk(cli(root, 'generate', 'command', 'billing', 'VoidInvoice', '--aggregate', 'Invoice', '--public'));
    expectOk(cli(root, 'generate', 'controller', 'billing', 'VoidInvoice', ...route));

    const fresh = report(cli(root, 'generate', 'e2e', 'billing', 'VoidInvoice', '--json'));

    expect(fresh.notes).toContain(
      `${HANDLER} still refuses (its TODO(domain)): \`pending(...)\` holds the scenarios of the end-to-end spec that wait for it, and fails them once it is written: remove it then.`,
    );

    expect(read(root, SPEC)).toContain("import { expectStatus, pending } from '@ddd-ts-kit/testing/e2e';");

    expect(read(root, SPEC)).toContain(
      "  it(\n    'answers 204 to DELETE /invoices/:invoiceId',\n    pending(async () => {\n      // TODO(domain): arrange",
    );

    expect(read(root, SPEC)).toContain('      expectStatus(response, 204);\n    }),\n  );\n');

    write(root, HANDLER, read(root, HANDLER).replace(/^ *throw undecided\(.*\n/m, ''));

    fs.rmSync(path.join(root, SPEC));

    const written = report(cli(root, 'generate', 'e2e', 'billing', 'VoidInvoice', '--json'));

    expect(read(root, SPEC)).toContain("  it('answers 204 to DELETE /invoices/:invoiceId', async () => {");
    expect(read(root, SPEC)).not.toContain('pending');
    expect(written.notes.join('\n')).not.toContain('still refuses');
  });
});
