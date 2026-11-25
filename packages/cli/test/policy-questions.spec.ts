import { describe, expect, it } from 'vitest';
import { cli, read, tempDir, write } from './helpers';

const BILLING = 'src/contexts/billing';
const HANDLER = `${BILLING}/application/commands/cancel-invoice/cancel-invoice.handler.ts`;
const MARKER = "// TODO(domain): a policy refines billingPermissions['invoice.cancel']";

const TERMS = [
  '--term',
  'Invoice=A request for payment sent to a customer',
  '--term',
  'Cancel=To void an invoice before payment',
];

function billing(): string {
  const project = tempDir('policy-questions');

  expect(cli(project, 'init', '--context', 'billing:core').code).toBe(0);

  return project;
}

function generate(project: string, ...args: string[]): void {
  const result = cli(project, 'generate', ...args);

  expect(result.code, result.stderr).toBe(0);
}

describe('a policy and the use cases of its permission', () => {
  it('writes a generated command again asking the policy, and the checker accepts it', () => {
    const project = billing();

    generate(project, 'command', 'billing', 'CancelInvoice', '--permission', 'invoice.cancel', ...TERMS);
    generate(project, 'policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel');

    const handler = read(project, HANDLER);

    expect(handler).toContain('  constructor(private readonly access: Access) {}');
    // The handler refuses until it is written: the marker says where it will ask, about the element it loads.
    expect(handler).toContain(`${MARKER}: ask it about the element "cancel invoice" acts on once it is loaded`);
    expect(handler).not.toContain('\n    await this.access.authorize(');
    expect(handler).not.toContain(', command)');

    expect(read(project, `${BILLING}/application/application.declarations.ts`)).toContain(
      'injected(CancelInvoiceHandler, [Access]);',
    );

    expect(cli(project, 'check', '--rule', 'authz/policy-asked').code).toBe(0);
  });

  it('leaves only a marker in a handler the team already changed', () => {
    const project = billing();

    generate(project, 'command', 'billing', 'CancelInvoice', '--permission', 'invoice.cancel', ...TERMS);

    write(
      project,
      HANDLER,
      read(project, HANDLER).replace('// TODO(domain): receive the repository', '// receive the repository'),
    );

    generate(project, 'policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel');

    const handler = read(project, HANDLER);

    expect(handler).toContain(`${MARKER}: load the element this command acts on, then ask it before the change`);
    expect(handler).not.toContain('\n    await this.access.authorize(');
    expect(cli(project, 'check', '--rule', 'authz/policy-asked').code).toBe(0);
  });

  it('generates a command asking the policy of its permission when the policy exists already', () => {
    const project = billing();

    generate(project, 'entity', 'billing', 'InvoiceLine', ...TERMS, '--term', 'Line=One billed item of an invoice');
    generate(project, 'policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel');
    generate(project, 'command', 'billing', 'CancelInvoice', '--permission', 'invoice.cancel', ...TERMS);

    expect(read(project, HANDLER)).toContain(
      `${MARKER}: ask it about the element "cancel invoice" acts on once it is loaded`,
    );

    expect(read(project, HANDLER)).toContain('  constructor(private readonly access: Access) {}');
  });

  it('leaves alone a handler that already asks, and reports one that stopped asking', () => {
    const project = billing();

    generate(project, 'command', 'billing', 'CancelInvoice', '--permission', 'invoice.cancel', ...TERMS);

    const asking = read(project, HANDLER).replace(
      '  async execute(command: CancelInvoiceCommand): Promise<void> {\n',
      "  async execute(command: CancelInvoiceCommand): Promise<void> {\n    await this.access.authorize(command.actor, billingPermissions['invoice.cancel'], command);\n",
    );

    write(project, HANDLER, asking);
    generate(project, 'policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel');

    expect(read(project, HANDLER)).not.toContain(MARKER);

    write(project, HANDLER, asking.replace(/^ {4}await this\.access\.authorize.*\n/m, ''));

    expect(cli(project, 'check', '--rule', 'authz/policy-asked').code).toBe(1);
  });
});

describe('a policy whose permission names a word the glossary does not hold yet', () => {
  it('adds the term given with --term to the glossary, as its refusal asks, and writes the policy', () => {
    const project = billing();
    const policy = ['policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel'];

    generate(project, 'aggregate', 'billing', 'Invoice', TERMS[0] ?? '', TERMS[1] ?? '');

    const refused = cli(project, 'generate', ...policy);

    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain('--term "Cancel=<what it means for the business>"');

    generate(project, ...policy, '--term', 'Cancel=To void an invoice before payment');

    expect(read(project, `${BILLING}/CONTEXT.md`)).toContain('| Cancel | To void an invoice before payment |');

    expect(read(project, `${BILLING}/application/authorization/only-issuer-cancels.policy.ts`)).toContain(
      'class OnlyIssuerCancels',
    );
  });
});

describe('the spec of a policy', () => {
  it('is titled by the question it answers, the last segment of the permission its action, the others its element', () => {
    const project = billing();
    const terms = ['--term', 'Line=One billed item', '--term', 'Add=To put on an invoice'];

    generate(project, 'aggregate', 'billing', 'Invoice', TERMS[0] ?? '', TERMS[1] ?? '');
    generate(project, 'policy', 'billing', 'OnlyIssuerAddsLines', '--permission', 'invoice.line.add', ...terms);

    expect(read(project, `${BILLING}/test/unit/only-issuer-adds-lines.policy.spec.ts`)).toContain(
      "describe('Who may add an invoice line', () => {",
    );
  });
});

describe('a policy as generated', () => {
  it.each([
    ['declared', [], '  allows(_actor: Actor): boolean {\n    return false;\n  }'],
    ['explicit', ['--style', 'explicit'], '  allows: () => false,'],
  ])('refuses everybody until its rule is written, in the %s style, and its spec says so', (_style, flags, refusal) => {
    const project = tempDir('policy-refuses');

    expect(cli(project, 'init', ...flags, '--context', 'billing:core').code).toBe(0);
    generate(project, 'policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel', ...TERMS);

    const policy = read(project, `${BILLING}/application/authorization/only-issuer-cancels.policy.ts`);
    const spec = read(project, `${BILLING}/test/unit/only-issuer-cancels.policy.spec.ts`);

    expect(policy).toContain(refusal);
    expect(policy).toContain('TODO(domain): a policy refuses everybody until its rule is written.');
    expect(policy).not.toContain('isAuthenticated');
    expect(spec).toContain("it('refuses everybody until its rule is written', () => {");
    expect(spec).toContain("it.todo('allows the actor the rule is written for');");
    expect(spec).not.toContain('toBe(true)');
    // The permission and the name are said once, where the policy is declared: its spec holds the rule alone.
    expect(spec).not.toContain('bears on the permission');
  });
});

describe('a policy and the use cases of its permission, beyond a plain command', () => {
  const QUERY = `${BILLING}/application/queries/get-invoice/get-invoice.handler.ts`;
  const READ = ['--term', 'Get=To read one element'];
  const MODULE = `${BILLING}/billing.module.ts`;

  function explicit(): string {
    const project = tempDir('policy-questions-explicit');

    expect(cli(project, 'init', '--style', 'explicit', '--context', 'billing:core').code).toBe(0);

    return project;
  }

  it('writes again a command on an aggregate and a plain query, and leaves a search that asks its scope', () => {
    const project = billing();

    generate(project, 'aggregate', 'billing', 'Invoice', ...TERMS);

    generate(
      project,
      'command',
      'billing',
      'CancelInvoice',
      '--permission',
      'invoice.cancel',
      '--creates',
      '--aggregate',
      'Invoice',
      ...TERMS,
    );

    generate(project, 'query', 'billing', 'GetInvoice', '--permission', 'invoice.cancel', ...TERMS, ...READ);

    generate(
      project,
      'query',
      'billing',
      'SearchInvoices',
      '--permission',
      'invoice.cancel',
      '--search',
      ...TERMS,
      '--term',
      'Search=To find elements',
    );

    generate(project, 'policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel');

    // The birth asks about the aggregate it builds, the query about what it read: never about the message.
    expect(read(project, HANDLER)).toContain(
      "    await this.access.authorize(command.actor, billingPermissions['invoice.cancel'], invoice);",
    );

    expect(read(project, QUERY)).toContain(
      "    await this.access.authorize(query.actor, billingPermissions['invoice.cancel'], answer);",
    );

    expect(read(project, `${BILLING}/test/unit/cancel-invoice.handler.spec.ts`)).toContain(
      "it('is refused to an actor the policy of invoice.cancel does not let through', async () => {",
    );

    expect(read(project, `${BILLING}/application/queries/search-invoices/search-invoices.handler.ts`)).not.toContain(
      'TODO(domain): a policy refines',
    );

    expect(read(project, `${BILLING}/application/application.declarations.ts`)).toContain(
      'injected(GetInvoiceHandler, [GetInvoiceReader, Access]);',
    );
  });

  it('writes again the registration of a query of a project in the explicit style', () => {
    const project = explicit();

    generate(project, 'query', 'billing', 'GetInvoice', '--permission', 'invoice.cancel', ...TERMS, ...READ);
    generate(project, 'policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel');

    expect(read(project, MODULE)).toContain('.handledBy(GetInvoiceHandler, [GetInvoiceReader, Access]);');
    expect(read(project, MODULE)).toMatch(/import \{ Access \} from '@ddd-ts-kit\/auth';/);

    expect(read(project, QUERY)).toContain(
      "await this.access.authorize(query.actor, billingPermissions['invoice.cancel'], answer);",
    );
  });

  it('leaves only a marker in a query whose registration the team changed', () => {
    const project = explicit();

    generate(project, 'query', 'billing', 'GetInvoice', '--permission', 'invoice.cancel', ...TERMS, ...READ);

    const changed = read(project, MODULE).replace('[GetInvoiceReader]);', '[GetInvoiceReader, Clock]);');

    write(project, MODULE, changed);
    generate(project, 'policy', 'billing', 'OnlyIssuerCancels', '--permission', 'invoice.cancel');

    expect(read(project, QUERY)).toContain(
      "// TODO(domain): a policy refines billingPermissions['invoice.cancel']: load the element this query acts on",
    );

    expect(read(project, MODULE)).toBe(changed);
  });
});
